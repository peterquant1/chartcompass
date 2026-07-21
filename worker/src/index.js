/**
 * ChartCompass 收款后端 — Cloudflare Worker
 *
 * 路由：
 *   POST /api/checkout    前端点击购买 → 现开一张 OxaPay 发票，返回 payment_url
 *   POST /api/webhook     OxaPay 付款状态回调（HMAC sha512 验签 + 金额下限复核）
 *   GET  /api/order/:id   成功页轮询订单状态
 *   POST /api/claim       买家付款后提交 TradingView 用户名，Telegram 通知店主交付
 */

const OXAPAY_INVOICE_API = "https://api.oxapay.com/v1/payment/invoice";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const YEAR_TTL = 60 * 60 * 24 * 365;

export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        const cors = corsHeaders(request, env);

        if (request.method === "OPTIONS") {
            return new Response(null, { status: 204, headers: cors });
        }

        try {
            if (url.pathname === "/api/checkout" && request.method === "POST") {
                return await checkout(request, env, url, cors);
            }
            if (url.pathname === "/api/webhook" && request.method === "POST") {
                return await webhook(request, env);
            }
            if (url.pathname.startsWith("/api/order/") && request.method === "GET") {
                return await orderStatus(url, env, cors);
            }
            if (url.pathname === "/api/claim" && request.method === "POST") {
                return await claim(request, env, cors);
            }
            return json({ error: "not_found" }, 404, cors);
        } catch (e) {
            // 内部错误只记日志，不对外泄露实现细节
            console.log("unhandled_error:", (e && e.stack) || String(e));
            return json({ error: "server_error" }, 500, cors);
        }
    },
};

/* ---------- 创建发票 ---------- */
async function checkout(request, env, url, cors) {
    if (!env.OXAPAY_MERCHANT_API_KEY) {
        return json({ error: "not_configured" }, 503, cors);
    }

    // 匿名接口，按 IP 限流，防脚本刷发票打满 KV 写配额
    const ip = request.headers.get("CF-Connecting-IP") || "0";
    if (!(await rateLimit(env, "checkout", ip, 8, 60))) {
        return json({ error: "rate_limited" }, 429, cors);
    }

    const orderId = crypto.randomUUID();
    const invoiceReq = {
        amount: Number(env.PRICE_AMOUNT || 99),
        currency: env.PRICE_CURRENCY || "USDT",
        lifetime: Number(env.INVOICE_LIFETIME || 60),
        fee_paid_by_payer: 1,
        under_paid_coverage: 0, // 固定单价商品不容许少付；配合 webhook 金额复核
        callback_url: `${url.origin}/api/webhook`,
        return_url: `${env.SITE_URL}/success.html?order=${orderId}`,
        order_id: orderId,
        description: "ChartCompass indicator - lifetime access",
        sandbox: false,
    };

    let body = null;
    try {
        const resp = await fetch(OXAPAY_INVOICE_API, {
            method: "POST",
            headers: {
                merchant_api_key: env.OXAPAY_MERCHANT_API_KEY,
                "content-type": "application/json",
            },
            body: JSON.stringify(invoiceReq),
        });
        body = await resp.json().catch(() => null);
        if (!resp.ok || !body || !body.data || !body.data.payment_url) {
            console.log("oxapay_invoice_fail:", resp.status, body && body.message);
            return json({ error: "oxapay_error" }, 502, cors);
        }
    } catch (e) {
        console.log("oxapay_unreachable:", String(e));
        return json({ error: "oxapay_error" }, 502, cors);
    }

    try {
        await env.ORDERS.put(
            "order:" + orderId,
            JSON.stringify({
                order_id: orderId,
                track_id: body.data.track_id,
                status: "Pending",
                created: Date.now(),
                expired_at: body.data.expired_at,
            }),
            { expirationTtl: YEAR_TTL }
        );
    } catch (e) {
        console.log("kv_put_fail:", String(e));
        return json({ error: "server_error" }, 500, cors);
    }

    return json({ payment_url: body.data.payment_url, order_id: orderId }, 200, cors);
}

/* ---------- OxaPay 回调 ---------- */
async function webhook(request, env) {
    if (!env.OXAPAY_MERCHANT_API_KEY) {
        return new Response("not configured", { status: 503 });
    }
    const raw = await request.text();
    const sig = (request.headers.get("HMAC") || "").toLowerCase();
    const expected = await hmacSha512Hex(env.OXAPAY_MERCHANT_API_KEY, raw);
    if (!sig || !timingSafeEqualHex(sig, expected)) {
        return new Response("invalid signature", { status: 401 });
    }

    let data;
    try {
        data = JSON.parse(raw);
    } catch {
        return new Response("bad payload", { status: 400 });
    }

    if (data.order_id && UUID_RE.test(data.order_id)) {
        const key = "order:" + data.order_id;
        const rec = await env.ORDERS.get(key, "json");
        if (rec) {
            const incoming = String(data.status || "").toLowerCase();
            rec.track_id = data.track_id || rec.track_id;
            rec.paid_amount = data.amount;
            rec.paid_currency = data.currency;
            rec.updated = Date.now();

            if (incoming === "paid") {
                // 金额下限复核：即便回调已验签，也拦截"荒谬低价发票"
                // （如误留 PRICE_AMOUNT=1 测试值）与币种不符，挂起待人工，绝不自动交付
                const floor = Number(env.MIN_PAID_AMOUNT || 50);
                const wantCur = (env.PRICE_CURRENCY || "USDT").toUpperCase();
                const gotAmt = Number(data.amount);
                const gotCur = String(data.currency || "").toUpperCase();
                const amountOk = Number.isFinite(gotAmt) && gotAmt >= floor;
                const currencyOk = !gotCur || gotCur === wantCur;

                if (amountOk && currencyOk) {
                    rec.status = "paid";
                    await env.ORDERS.put(key, JSON.stringify(rec), { expirationTtl: YEAR_TTL });
                    await notifyTelegram(
                        env,
                        `💰 ChartCompass 已收款\n订单: ${data.order_id}\nTrack: ${data.track_id}\n金额: ${gotAmt} ${gotCur || wantCur}\n\n等待买家提交 TradingView 用户名（提交后会再通知你）。`
                    );
                } else {
                    // 金额/币种异常：标记待人工复核，claim 不会放行自动交付
                    rec.status = "review";
                    await env.ORDERS.put(key, JSON.stringify(rec), { expirationTtl: YEAR_TTL });
                    await notifyTelegram(
                        env,
                        `⚠️ ChartCompass 付款金额异常，已挂起待人工核对（勿自动交付）\n订单: ${data.order_id}\n实付: ${gotAmt} ${gotCur}\n期望: ≥${floor} ${wantCur}\n请到 OxaPay 后台核实后再决定是否交付。`
                    );
                }
            } else {
                // 非 paid 状态（Waiting/Confirming/Expired/Failed 等）如实记录
                rec.status = data.status || rec.status;
                await env.ORDERS.put(key, JSON.stringify(rec), { expirationTtl: YEAR_TTL });
            }
        }
    }
    // OxaPay 要求回调端点返回 200 'ok'
    return new Response("ok", { status: 200 });
}

/* ---------- 订单状态查询 ---------- */
async function orderStatus(url, env, cors) {
    const id = url.pathname.split("/").pop();
    if (!UUID_RE.test(id)) return json({ error: "bad_id" }, 400, cors);
    const rec = await env.ORDERS.get("order:" + id, "json");
    if (!rec) return json({ error: "not_found" }, 404, cors);
    return json(
        {
            status: rec.status,
            paid: String(rec.status).toLowerCase() === "paid",
            claimed: !!rec.claim,
        },
        200,
        cors
    );
}

/* ---------- 买家提交 TradingView 用户名 ---------- */
async function claim(request, env, cors) {
    const body = await request.json().catch(() => null);
    if (!body || !body.order || !body.username) {
        return json({ error: "missing_fields" }, 400, cors);
    }
    if (!UUID_RE.test(String(body.order))) {
        return json({ error: "bad_id" }, 400, cors);
    }

    // 按 IP 限流，防止 order_id 泄露后被刷/轰炸
    const ip = request.headers.get("CF-Connecting-IP") || "0";
    if (!(await rateLimit(env, "claim", ip, 10, 60))) {
        return json({ error: "rate_limited" }, 429, cors);
    }

    const username = clean(body.username, 60);
    const email = clean(body.email, 120);
    const telegram = clean(body.telegram, 60).replace(/^@/, "");
    if (!username) return json({ error: "missing_fields" }, 400, cors);

    const key = "order:" + body.order;
    const rec = await env.ORDERS.get(key, "json");
    if (!rec) return json({ error: "not_found" }, 404, cors);
    if (String(rec.status).toLowerCase() !== "paid") {
        return json({ error: "not_paid" }, 409, cors);
    }
    // 一次性：已提交过交付信息则拒绝覆盖，防交付劫持
    if (rec.claim) {
        return json({ error: "already_claimed" }, 409, cors);
    }

    rec.claim = { username, email, telegram, at: Date.now() };
    await env.ORDERS.put(key, JSON.stringify(rec), { expirationTtl: YEAR_TTL });

    await notifyTelegram(
        env,
        `🎫 交付请求 — ChartCompass\n订单: ${rec.order_id}\nTradingView 用户名: ${username}${email ? "\n邮箱: " + email : ""}${telegram ? "\nTelegram: @" + telegram : ""}\n\n→ 去 TradingView 后台把该用户名加入 invite-only 访问名单。`
    );

    return json({ ok: true }, 200, cors);
}

/* ---------- 工具函数 ---------- */

// 去除换行/制表等控制字符并截断，防 Telegram 通知伪造字段
function clean(s, max) {
    return String(s == null ? "" : s)
        .replace(/[\r\n\t\u0000-\u001F\u007F]+/g, " ")
        .trim()
        .slice(0, max);
}

// KV 计数滑动窗口限流（最终一致，用于挡明显的脚本滥用而非精确配额）
async function rateLimit(env, bucket, ip, max, windowSec) {
    try {
        const slot = Math.floor(Date.now() / 1000 / windowSec);
        const key = `rl:${bucket}:${ip}:${slot}`;
        const n = Number(await env.ORDERS.get(key)) || 0;
        if (n >= max) return false;
        await env.ORDERS.put(key, String(n + 1), { expirationTtl: windowSec * 2 });
        return true;
    } catch {
        // 限流存储异常时放行，避免误伤正常请求
        return true;
    }
}

function corsHeaders(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowed = (env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim());
    const h = {
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "86400",
    };
    if (allowed.includes(origin)) h["Access-Control-Allow-Origin"] = origin;
    return h;
}

function json(obj, status, cors) {
    return new Response(JSON.stringify(obj), {
        status: status || 200,
        headers: { "content-type": "application/json", ...(cors || {}) },
    });
}

async function hmacSha512Hex(key, message) {
    const enc = new TextEncoder();
    const cryptoKey = await crypto.subtle.importKey(
        "raw",
        enc.encode(key),
        { name: "HMAC", hash: "SHA-512" },
        false,
        ["sign"]
    );
    const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(message));
    return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqualHex(a, b) {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
}

async function notifyTelegram(env, text) {
    if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return;
    try {
        await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text }),
        });
    } catch {
        // 通知失败不影响主流程
    }
}

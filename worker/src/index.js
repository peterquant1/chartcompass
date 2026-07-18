/**
 * ChartCompass 收款后端 — Cloudflare Worker
 *
 * 路由：
 *   POST /api/checkout    前端点击购买 → 现开一张 OxaPay 发票，返回 payment_url
 *   POST /api/webhook     OxaPay 付款状态回调（HMAC sha512 验签）
 *   GET  /api/order/:id   成功页轮询订单状态
 *   POST /api/claim       买家付款后提交 TradingView 用户名，Telegram 通知店主交付
 */

const OXAPAY_INVOICE_API = "https://api.oxapay.com/v1/payment/invoice";

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
            return json({ error: "server_error", detail: String(e) }, 500, cors);
        }
    },
};

/* ---------- 创建发票 ---------- */
async function checkout(request, env, url, cors) {
    if (!env.OXAPAY_MERCHANT_API_KEY) {
        return json({ error: "not_configured" }, 503, cors);
    }
    const orderId = crypto.randomUUID();
    const invoiceReq = {
        amount: Number(env.PRICE_AMOUNT || 1500),
        currency: env.PRICE_CURRENCY || "USDT",
        lifetime: Number(env.INVOICE_LIFETIME || 60),
        fee_paid_by_payer: 1,
        under_paid_coverage: 2.5,
        callback_url: `${url.origin}/api/webhook`,
        return_url: `${env.SITE_URL}/success.html?order=${orderId}`,
        order_id: orderId,
        description: "ChartCompass indicator - lifetime access",
        sandbox: false,
    };

    const resp = await fetch(OXAPAY_INVOICE_API, {
        method: "POST",
        headers: {
            merchant_api_key: env.OXAPAY_MERCHANT_API_KEY,
            "content-type": "application/json",
        },
        body: JSON.stringify(invoiceReq),
    });
    const body = await resp.json().catch(() => null);

    if (!resp.ok || !body || !body.data || !body.data.payment_url) {
        return json(
            { error: "oxapay_error", detail: (body && body.message) || resp.status },
            502,
            cors
        );
    }

    await env.ORDERS.put(
        "order:" + orderId,
        JSON.stringify({
            order_id: orderId,
            track_id: body.data.track_id,
            status: "Pending",
            created: Date.now(),
            expired_at: body.data.expired_at,
        }),
        { expirationTtl: 60 * 60 * 24 * 365 }
    );

    return json({ payment_url: body.data.payment_url, order_id: orderId }, 200, cors);
}

/* ---------- OxaPay 回调 ---------- */
async function webhook(request, env) {
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

    if (data.order_id) {
        const key = "order:" + data.order_id;
        const rec = await env.ORDERS.get(key, "json");
        if (rec) {
            rec.status = data.status || rec.status;
            rec.track_id = data.track_id || rec.track_id;
            rec.paid_amount = data.amount;
            rec.paid_currency = data.currency;
            rec.updated = Date.now();
            await env.ORDERS.put(key, JSON.stringify(rec), {
                expirationTtl: 60 * 60 * 24 * 365,
            });

            if (String(data.status).toLowerCase() === "paid") {
                await notifyTelegram(
                    env,
                    `💰 ChartCompass 已收款\n订单: ${data.order_id}\nTrack: ${data.track_id}\n金额: ${data.amount} ${data.currency || "USDT"}\n\n等待买家提交 TradingView 用户名（提交后会再通知你）。`
                );
            }
        }
    }
    // OxaPay 要求回调端点返回 200 'ok'
    return new Response("ok", { status: 200 });
}

/* ---------- 订单状态查询 ---------- */
async function orderStatus(url, env, cors) {
    const id = url.pathname.split("/").pop();
    if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: "bad_id" }, 400, cors);
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
    const username = String(body.username).trim().slice(0, 60);
    const email = String(body.email || "").trim().slice(0, 120);
    const telegram = String(body.telegram || "").trim().slice(0, 60);
    if (!username) return json({ error: "missing_fields" }, 400, cors);

    const key = "order:" + body.order;
    const rec = await env.ORDERS.get(key, "json");
    if (!rec) return json({ error: "not_found" }, 404, cors);
    if (String(rec.status).toLowerCase() !== "paid") {
        return json({ error: "not_paid" }, 409, cors);
    }

    rec.claim = { username, email, telegram, at: Date.now() };
    await env.ORDERS.put(key, JSON.stringify(rec), {
        expirationTtl: 60 * 60 * 24 * 365,
    });

    await notifyTelegram(
        env,
        `🎫 交付请求 — ChartCompass\n订单: ${rec.order_id}\nTradingView 用户名: ${username}${email ? "\n邮箱: " + email : ""}${telegram ? "\nTelegram: @" + telegram : ""}\n\n→ 去 TradingView 后台把该用户名加入 invite-only 访问名单。`
    );

    return json({ ok: true }, 200, cors);
}

/* ---------- 工具函数 ---------- */
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

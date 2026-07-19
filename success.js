/* ============ 订单状态页 ============ */
const API_BASE = ((window.CC_CONFIG || {}).apiBase || "").replace(/\/$/, "");
const orderId = new URLSearchParams(location.search).get("order") || "";

const cards = {
    checking: document.getElementById("stChecking"),
    pending: document.getElementById("stPending"),
    confirming: document.getElementById("stConfirming"),
    paid: document.getElementById("stPaid"),
    review: document.getElementById("stReview"),
    expired: document.getElementById("stExpired"),
    netfail: document.getElementById("stNetfail"),
    done: document.getElementById("stDone"),
    invalid: document.getElementById("stInvalid"),
};

function show(name) {
    Object.entries(cards).forEach(([k, el]) => {
        if (el) el.hidden = k !== name;
    });
}

let pollTimer = null;
let settled = false;
let netFails = 0;

function stop() {
    settled = true;
    if (pollTimer) clearInterval(pollTimer);
}

async function poll() {
    if (settled) return;
    if (!API_BASE || !orderId) {
        show("invalid");
        stop();
        return;
    }

    let r;
    try {
        r = await fetch(`${API_BASE}/api/order/${orderId}`);
    } catch {
        // 网络不可达：累计失败，多次后降级为提示态，不再无限空转
        if (++netFails >= 4) {
            show("netfail");
            stop();
        }
        return;
    }
    if (settled) return;

    if (r.status === 404 || r.status === 400) {
        // 订单不存在 / 链接非法：不可恢复
        show("invalid");
        stop();
        return;
    }
    if (!r.ok) {
        // 5xx 等临时错误：计入失败，多次后降级
        if (++netFails >= 4) {
            show("netfail");
            stop();
        }
        return;
    }
    netFails = 0;

    let j;
    try {
        j = await r.json();
    } catch {
        return;
    }
    if (settled) return;

    const st = String(j.status || "").toLowerCase();
    if (j.claimed) {
        show("done");
        stop();
    } else if (j.paid) {
        show("paid");
        stop();
    } else if (st === "review") {
        // 已付款但金额异常，后端挂起待人工核对
        show("review");
        stop();
    } else if (st === "expired" || st === "failed") {
        show("expired");
        stop();
    } else if (st === "paying" || st === "confirming") {
        show("confirming");
    } else {
        show("pending");
    }
}

pollTimer = setInterval(poll, 5000);
poll();

/* 付款确认后提交 TradingView 用户名 */
document.getElementById("claimForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector("button[type=submit]");
    const errEl = document.getElementById("claimError");
    btn.disabled = true;
    if (errEl) errEl.hidden = true;
    try {
        const r = await fetch(`${API_BASE}/api/claim`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                order: orderId,
                username: document.getElementById("fUser").value,
                email: document.getElementById("fEmail").value,
                telegram: document.getElementById("fTg").value.replace(/^@/, ""),
            }),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j.ok) throw new Error(j.error || r.status);
        stop(); // 交付信息已提交，停止轮询，避免迟到响应把页面打回
        show("done");
    } catch {
        if (errEl) {
            errEl.textContent = ccT("success.claimErr");
            errEl.hidden = false;
        }
        btn.disabled = false;
    }
});

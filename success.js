/* ============ 订单状态页 ============ */
const API_BASE = ((window.CC_CONFIG || {}).apiBase || "").replace(/\/$/, "");
const orderId = new URLSearchParams(location.search).get("order") || "";

const cards = {
    checking: document.getElementById("stChecking"),
    pending: document.getElementById("stPending"),
    confirming: document.getElementById("stConfirming"),
    paid: document.getElementById("stPaid"),
    done: document.getElementById("stDone"),
    invalid: document.getElementById("stInvalid"),
};

function show(name) {
    Object.entries(cards).forEach(([k, el]) => {
        el.hidden = k !== name;
    });
}

let pollTimer = null;

async function poll() {
    if (!API_BASE || !orderId) {
        show("invalid");
        return;
    }
    try {
        const r = await fetch(`${API_BASE}/api/order/${orderId}`);
        if (r.status === 404) {
            show("invalid");
            return;
        }
        const j = await r.json();
        if (j.claimed) {
            show("done");
            clearInterval(pollTimer);
        } else if (j.paid) {
            show("paid");
            clearInterval(pollTimer);
        } else if (String(j.status).toLowerCase() === "paying" || String(j.status).toLowerCase() === "confirming") {
            show("confirming");
        } else {
            show("pending");
        }
    } catch {
        // 网络抖动时保持当前状态，下一轮重试
    }
}

poll();
pollTimer = setInterval(poll, 5000);

/* 付款确认后提交 TradingView 用户名 */
document.getElementById("claimForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector("button[type=submit]");
    btn.disabled = true;
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
        const j = await r.json();
        if (!r.ok || !j.ok) throw new Error(j.error || r.status);
        show("done");
    } catch {
        alert(ccT("success.claimErr"));
        btn.disabled = false;
    }
});

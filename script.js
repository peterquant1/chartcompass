/* ============ 导航 ============ */
const nav = document.getElementById("nav");
const burger = document.getElementById("navBurger");
const mobileMenu = document.getElementById("navMobile");

window.addEventListener("scroll", () => {
    nav.classList.toggle("is-scrolled", window.scrollY > 8);
}, { passive: true });

function setMenu(open) {
    burger.classList.toggle("is-open", open);
    mobileMenu.classList.toggle("is-open", open);
    burger.setAttribute("aria-expanded", open ? "true" : "false");
}
burger.addEventListener("click", () => setMenu(!burger.classList.contains("is-open")));
mobileMenu.querySelectorAll("a").forEach((a) =>
    a.addEventListener("click", () => setMenu(false))
);

/* ============ FAQ 手风琴 ============ */
document.querySelectorAll(".faq-item").forEach((item) => {
    const q = item.querySelector(".faq-item__q");
    q.addEventListener("click", () => {
        const willOpen = !item.classList.contains("is-open");
        document.querySelectorAll(".faq-item.is-open").forEach((el) => {
            el.classList.remove("is-open");
            const b = el.querySelector(".faq-item__q");
            if (b) b.setAttribute("aria-expanded", "false");
        });
        item.classList.toggle("is-open", willOpen);
        q.setAttribute("aria-expanded", willOpen ? "true" : "false");
    });
});

/* ============ 滚动入场（不依赖 IntersectionObserver） ============ */
function updateReveals() {
    const vh = window.innerHeight;
    document.querySelectorAll(".reveal:not(.in-view)").forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.top < vh * 0.92 && r.bottom > 0) el.classList.add("in-view");
    });
}
window.addEventListener("scroll", updateReveals, { passive: true });
window.addEventListener("resize", updateReveals, { passive: true });
window.addEventListener("load", updateReveals);

/* ============ 评价切换（内容来自 i18n 字典，示例占位） ============ */
let activeReview = 0;

function renderReviews(focusActive) {
    const items = ccT("reviews.items") || [];
    const picker = document.getElementById("tPicker");
    if (!picker) return;
    picker.innerHTML = "";
    items.forEach((t, i) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "picker-btn" + (i === activeReview ? " is-active" : "");
        // 完整 tab 语义：role/aria-selected/aria-controls + roving tabindex（配合下方方向键导航）
        btn.id = "tTab" + i;
        btn.setAttribute("role", "tab");
        btn.setAttribute("aria-selected", i === activeReview ? "true" : "false");
        btn.setAttribute("aria-controls", "tPanel");
        btn.tabIndex = i === activeReview ? 0 : -1;
        const initial = String.fromCharCode(65 + i);
        // 用 textContent 而非 innerHTML 拼接，避免未来接入真实评价（可能含 <、& 等）时的 XSS
        const av = document.createElement("span");
        av.className = "avatar";
        av.textContent = initial;
        const nm = document.createElement("span");
        nm.textContent = t.name;
        btn.append(av, nm);
        btn.addEventListener("click", () => {
            activeReview = i;
            renderReviews();
        });
        picker.appendChild(btn);
    });
    const t = items[activeReview];
    if (t) {
        document.getElementById("tQuote").textContent = t.quote;
        document.getElementById("tName").textContent = t.name;
        document.getElementById("tRole").textContent = t.role;
        document.getElementById("tAvatar").textContent = String.fromCharCode(65 + activeReview);
    }
    const panel = document.getElementById("tPanel");
    if (panel) panel.setAttribute("aria-labelledby", "tTab" + activeReview);
    if (focusActive) {
        const el = document.getElementById("tTab" + activeReview);
        if (el) el.focus();
    }
}
document.addEventListener("cc:lang", () => renderReviews());

/* 评价 tab 的方向键导航（ARIA tabs 模式：←/→/Home/End 移动并选中） */
const tPickerEl = document.getElementById("tPicker");
if (tPickerEl) {
    tPickerEl.addEventListener("keydown", (e) => {
        const n = (ccT("reviews.items") || []).length;
        if (!n) return;
        let next = null;
        if (e.key === "ArrowRight") next = (activeReview + 1) % n;
        else if (e.key === "ArrowLeft") next = (activeReview - 1 + n) % n;
        else if (e.key === "Home") next = 0;
        else if (e.key === "End") next = n - 1;
        if (next === null) return;
        e.preventDefault();
        activeReview = next;
        renderReviews(true);
    });
}

/* ============ 底部吸底购买条 ============ */
const stickyBar = document.getElementById("stickyBar");
const pricing = document.getElementById("pricing");
const hero = document.querySelector(".hero");

function updateStickyBar() {
    const vh = window.innerHeight;
    const pastHero = hero.getBoundingClientRect().bottom < 0;
    const p = pricing.getBoundingClientRect();
    const atPricing = p.top < vh && p.bottom > 0;
    stickyBar.classList.toggle("is-visible", pastHero && !atPricing);
}
window.addEventListener("scroll", updateStickyBar, { passive: true });
window.addEventListener("resize", updateStickyBar, { passive: true });
updateStickyBar();

/* ============ 购买：点击时通过后端现开一张 OxaPay 发票 ============ */
const API_BASE = ((window.CC_CONFIG || {}).apiBase || "").replace(/\/$/, "");
const checkoutError = document.getElementById("checkoutError");

function showCheckoutError(msg, fromSticky) {
    if (checkoutError) {
        checkoutError.textContent = msg;
        checkoutError.hidden = false;
    }
    // 从吸底条触发时，把定价区滚进视野让用户看到内联错误
    if (fromSticky && pricing) pricing.scrollIntoView({ behavior: "smooth", block: "center" });
}

document.querySelectorAll(".js-buy").forEach((btn) => {
    btn.addEventListener("click", async () => {
        const fromSticky = !!btn.closest(".sticky-bar");
        if (checkoutError) checkoutError.hidden = true;
        if (!API_BASE) {
            showCheckoutError(ccT("checkout.unavailable"), fromSticky);
            return;
        }
        if (btn.classList.contains("is-loading")) return;
        btn.classList.add("is-loading");
        const restore = btn.innerHTML;
        btn.innerHTML = `<span>${ccT("checkout.creating")}</span>`;
        try {
            const r = await fetch(API_BASE + "/api/checkout", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ lang: window.ccLang }),
            });
            const j = await r.json().catch(() => ({}));
            if (!r.ok || !j.payment_url) throw new Error(j.error || r.status);
            window.location.href = j.payment_url;
        } catch (e) {
            // 留一条可读日志，便于用户报障时远程定位（CORS/网络/后端错误码）
            console.warn("checkout_failed:", e);
            showCheckoutError(ccT("checkout.error"), fromSticky);
            btn.classList.remove("is-loading");
            btn.innerHTML = restore;
        }
    });
});

/* 初次渲染（i18n 引擎在 DOMContentLoaded 时 applyLang 会触发 cc:lang → renderReviews） */
updateReveals();

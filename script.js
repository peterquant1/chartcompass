/* ============ 导航 ============ */
const nav = document.getElementById("nav");
const burger = document.getElementById("navBurger");
const mobileMenu = document.getElementById("navMobile");

window.addEventListener("scroll", () => {
    nav.classList.toggle("is-scrolled", window.scrollY > 8);
}, { passive: true });

burger.addEventListener("click", () => {
    burger.classList.toggle("is-open");
    mobileMenu.classList.toggle("is-open");
});
mobileMenu.querySelectorAll("a").forEach((a) =>
    a.addEventListener("click", () => {
        burger.classList.remove("is-open");
        mobileMenu.classList.remove("is-open");
    })
);

/* ============ FAQ 手风琴 ============ */
document.querySelectorAll(".faq-item").forEach((item) => {
    item.querySelector(".faq-item__q").addEventListener("click", () => {
        const wasOpen = item.classList.contains("is-open");
        document.querySelectorAll(".faq-item.is-open").forEach((el) => el.classList.remove("is-open"));
        if (!wasOpen) item.classList.add("is-open");
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

function renderReviews() {
    const items = ccT("reviews.items") || [];
    const picker = document.getElementById("tPicker");
    if (!picker) return;
    picker.innerHTML = "";
    items.forEach((t, i) => {
        const btn = document.createElement("button");
        btn.className = "picker-btn" + (i === activeReview ? " is-active" : "");
        btn.setAttribute("role", "tab");
        const initial = String.fromCharCode(65 + i);
        btn.innerHTML = `<span class="avatar">${initial}</span><span>${t.name}</span>`;
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
}
document.addEventListener("cc:lang", renderReviews);

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

document.querySelectorAll(".js-buy").forEach((btn) => {
    btn.addEventListener("click", async () => {
        if (!API_BASE) {
            alert(ccT("checkout.unavailable"));
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
            const j = await r.json();
            if (!r.ok || !j.payment_url) throw new Error(j.error || r.status);
            window.location.href = j.payment_url;
        } catch (e) {
            alert(ccT("checkout.error"));
            btn.classList.remove("is-loading");
            btn.innerHTML = restore;
        }
    });
});

/* ============================================================
   TradingView 风格演示图表 — 程序化生成 + 循环动画
   ============================================================ */
(function () {
    const svg = document.getElementById("tvChart");
    if (!svg) return;

    // [open, high, low, close, 色系] — u 上涨青绿 / r 强跌红 / o 中跌橙 / y 弱跌黄
    const CANDLES = [
        [86400, 86600, 85900, 86000, "o"], [86000, 86250, 85500, 85600, "r"],
        [85600, 86000, 85400, 85900, "u"], [85900, 86050, 85100, 85250, "r"],
        [85250, 85500, 84600, 84700, "r"], [84700, 84950, 84300, 84850, "u"],
        [84850, 85350, 84700, 85200, "u"], [85200, 85500, 84900, 85350, "u"],
        [85350, 85450, 84500, 84600, "r"], [84600, 84800, 83900, 84000, "o"],
        [84000, 84300, 83500, 83600, "o"], [83600, 84000, 83400, 83900, "u"],
        [83900, 84100, 83300, 83400, "y"], [83400, 83600, 82700, 82800, "o"],
        [82800, 83100, 82300, 82400, "r"], [82400, 82800, 82100, 82650, "u"],
        [82650, 82900, 82200, 82350, "y"], [82350, 82500, 81600, 81700, "o"],
        [81700, 82100, 81400, 82000, "u"], [82000, 82200, 81500, 81600, "y"],
        [81600, 81800, 81150, 81350, "o"], [81350, 81900, 81250, 81800, "u"],
        [81800, 82000, 81400, 81500, "y"], [81500, 81700, 81250, 81600, "u"],
        [81600, 82100, 81500, 82000, "u"], [82000, 82250, 81700, 81850, "y"],
        [81850, 82400, 81800, 82300, "u"], [82300, 82600, 82100, 82550, "u"],
        [82550, 82700, 82000, 82150, "y"], [82150, 82500, 81900, 82450, "u"],
        [82450, 83100, 82350, 83000, "u"], [83000, 83550, 82900, 83450, "u"],
        [83450, 83950, 83300, 83420, "u"], [83420, 83600, 83250, 83507, "u"],
    ];
    const COLORS = { u: "#26a69a", r: "#f23645", o: "#ff9800", y: "#f5c542" };

    const PMAX = 88200, PMIN = 80600, TOP = 14, BOT = 396;
    const PLOT_W = 754;
    const y = (p) => TOP + ((PMAX - p) / (PMAX - PMIN)) * (BOT - TOP);
    const x = (i) => 16 + i * 22;
    const CUR = 83507;

    let s = "";

    /* --- 区域（溢价红带 / 折价蓝带） --- */
    s += `<g class="g-zones">`;
    s += rect(0, y(88200), PLOT_W, y(84300) - y(88200), "rgba(242,54,69,.045)");
    s += rect(0, y(87600), PLOT_W, y(87150) - y(87600), "rgba(242,54,69,.14)");
    s += rect(0, y(84650), PLOT_W, y(84350) - y(84650), "rgba(242,54,69,.16)");
    s += rect(0, y(82500), PLOT_W, y(81400) - y(82500), "rgba(41,98,255,.10)");
    s += rect(0, y(81050), PLOT_W, y(80780) - y(81050), "rgba(41,98,255,.13)");
    s += `</g>`;

    /* --- 网格与坐标轴 --- */
    s += `<g class="g-grid">`;
    for (let p = 88000; p >= 80800; p -= 800) {
        s += `<line x1="0" y1="${y(p)}" x2="${PLOT_W}" y2="${y(p)}" stroke="rgba(0,0,0,.055)" stroke-width="1"/>`;
        s += `<text x="832" y="${y(p) + 3.5}" text-anchor="end" class="ax-lbl">${p.toLocaleString("en-US")}.00</text>`;
    }
    const XLBL = ["18:00", "30", "06:00", "12:00", "18:00", "31", "06:00", "12:00", "18:00", "Apr"];
    XLBL.forEach((t, i) => {
        const bold = t === "30" || t === "31" || t === "Apr";
        s += `<text x="${28 + i * 76}" y="462" text-anchor="middle" class="ax-lbl${bold ? " ax-lbl--b" : ""}">${t}</text>`;
    });
    s += `</g>`;

    /* --- 均线 / 趋势带线（JS 计算，路径绘制动画） --- */
    const closes = CANDLES.map((c) => c[3]);
    const highs = CANDLES.map((c) => c[1]);
    let maPts = [];
    for (let i = 4; i < CANDLES.length; i++) {
        const avg = (closes[i] + closes[i - 1] + closes[i - 2] + closes[i - 3] + closes[i - 4]) / 5;
        maPts.push(`${x(i)},${y(avg).toFixed(1)}`);
    }
    let trailPts = [];
    for (let i = 0; i < CANDLES.length; i++) {
        const win = highs.slice(Math.max(0, i - 7), i + 1);
        const hi = Math.max(...win) + 180;
        trailPts.push(`${x(i)},${y(hi).toFixed(1)}`);
    }
    s += `<g class="g-lines">`;
    s += `<polyline class="ln ln--trail" pathLength="1" points="${trailPts.join(" ")}"/>`;
    s += `<polyline class="ln ln--ma" pathLength="1" points="${maPts.join(" ")}"/>`;
    s += `<polyline class="ln ln--trend" pathLength="1" points="${x(2)},${y(86100)} ${x(29)},${y(80950)} ${x(31) + 8},${y(81900)}"/>`;
    s += `</g>`;

    /* --- 结构标注（EQH / BOS） --- */
    s += `<g class="g-extras">`;
    s += `<line x1="${x(5)}" y1="${y(85420)}" x2="${x(9) + 10}" y2="${y(85420)}" stroke="#f23645" stroke-width="1" stroke-dasharray="2 3"/>`;
    s += `<text x="${x(7)}" y="${y(85420) - 5}" text-anchor="middle" class="mk-lbl mk-lbl--red">EQH</text>`;
    s += `<line x1="${x(10)}" y1="${y(84120)}" x2="${x(13) + 10}" y2="${y(84120)}" stroke="#b91c1c" stroke-width="1" stroke-dasharray="4 3"/>`;
    s += `<text x="${x(11) + 11}" y="${y(84120) + 13}" text-anchor="middle" class="mk-lbl mk-lbl--dark">BOS</text>`;
    s += `</g>`;

    /* --- K线 --- */
    s += `<g class="g-candles">`;
    CANDLES.forEach((c, i) => {
        const [o, h, l, cl, k] = c;
        const col = COLORS[k];
        const bt = y(Math.max(o, cl));
        const bh = Math.max(2.5, Math.abs(y(o) - y(cl)));
        s += `<g class="cnd" style="animation-delay:${(i * 0.115).toFixed(2)}s">` +
            `<line x1="${x(i)}" y1="${y(h)}" x2="${x(i)}" y2="${y(l)}" stroke="${col}" stroke-width="1.6"/>` +
            `<rect x="${x(i) - 6}" y="${bt}" width="12" height="${bh}" rx="1.5" fill="${col}"/>` +
            `</g>`;
    });
    s += `</g>`;

    /* --- 当前价虚线 + Buy 信号 --- */
    s += `<g class="g-cur"><line x1="0" y1="${y(CUR)}" x2="${PLOT_W}" y2="${y(CUR)}" stroke="#2962ff" stroke-width="1" stroke-dasharray="3 3"/></g>`;

    const bx = x(31), by = y(82350) + 16;
    s += `<g class="g-signal">`;
    s += `<rect x="${bx - 21}" y="${by}" width="42" height="21" rx="5" fill="#089981"/>`;
    s += `<text x="${bx}" y="${by + 14.5}" text-anchor="middle" class="sig-lbl">Buy</text>`;
    s += `<path d="M ${x(33) + 14} ${y(83100)} l 7 10 h -4.5 v 12 h -5 v -12 h -4.5 z" fill="#2962ff"/>`;
    s += `</g>`;

    /* --- 右侧价格标签 --- */
    const tag = (py, color, label) =>
        `<g class="ptag"><rect x="760" y="${py - 9}" width="76" height="18" rx="3" fill="${color}"/>` +
        `<text x="798" y="${py + 3.5}" text-anchor="middle" class="ptag-lbl">${label}</text></g>`;
    s += `<g class="g-tags">`;
    s += tag(y(CUR) - 20, "#089981", "83,418.78");
    s += tag(y(CUR), "#2962ff", "83,507.00");
    s += tag(y(CUR) + 20, "#f23645", "83,264.76");
    s += tag(y(82578), "#26a69a", "82,578.55");
    s += tag(y(81493), "#089981", "81,493.26");
    s += `</g>`;

    svg.innerHTML = s;

    function rect(rx, ry, rw, rh, fill) {
        return `<rect x="${rx}" y="${ry.toFixed(1)}" width="${rw}" height="${Math.abs(rh).toFixed(1)}" fill="${fill}"/>`;
    }

    /* --- 循环播放（12 秒一轮；prefers-reduced-motion 时静态展示） --- */
    const demo = document.getElementById("tvDemo");
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    function play() {
        demo.classList.remove("anim");
        void demo.offsetWidth;
        demo.classList.add("anim");
    }
    play();
    setInterval(play, 12000);
})();

/* 初次渲染（i18n 引擎在 DOMContentLoaded 时 applyLang 会触发 cc:lang → renderReviews） */
updateReveals();

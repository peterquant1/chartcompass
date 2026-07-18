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

/* ============ 滚动入场（不依赖 IntersectionObserver，任何环境都能显示） ============ */
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
updateReveals();

/* ============ 评价切换（示例占位内容，上线前替换为真实反馈） ============ */
const TESTIMONIALS = [
    {
        name: "示例用户 A",
        role: "波段交易者",
        quote: "“本来怕太复杂，因为我还算新手。但用了之后，图确实开始变清楚了。我现在看的是结构，而不是干瞪着K线希望发生点什么。说实话希望早点遇到它。”",
    },
    {
        name: "示例用户 B",
        role: "日内交易者",
        quote: "“把手头两三个互相打架的指标全关了，现在只看这一套逻辑。决策更快，心态也稳了。”",
    },
    {
        name: "示例用户 C",
        role: "加密货币交易",
        quote: "“区域标注是我最常用的功能，价格到位置会提醒我，不用一直守在屏幕前。”",
    },
    {
        name: "示例用户 D",
        role: "外汇交易",
        quote: "“最大的变化是每笔交易前我知道自己在等什么。之前是看见动了就想追，现在是等设置出现。”",
    },
    {
        name: "示例用户 E",
        role: "兼职交易者",
        quote: "“白天上班没时间盯盘，提醒一响再打开图确认就行。对兼职做交易的人很友好。”",
    },
    {
        name: "示例用户 F",
        role: "指数交易",
        quote: "“换过不少工具，大多数是加一堆线让图更乱。这个反而是把图变干净了，只留下该看的。”",
    },
];

const tQuote = document.getElementById("tQuote");
const tName = document.getElementById("tName");
const tRole = document.getElementById("tRole");
const tAvatar = document.getElementById("tAvatar");
const tPicker = document.getElementById("tPicker");

TESTIMONIALS.forEach((t, i) => {
    const btn = document.createElement("button");
    btn.className = "picker-btn" + (i === 0 ? " is-active" : "");
    btn.setAttribute("role", "tab");
    const initial = String.fromCharCode(65 + i);
    btn.innerHTML = `<span class="avatar">${initial}</span><span>${t.name}</span>`;
    btn.addEventListener("click", () => {
        tPicker.querySelectorAll(".picker-btn").forEach((b) => b.classList.remove("is-active"));
        btn.classList.add("is-active");
        tQuote.textContent = t.quote;
        tName.textContent = t.name;
        tRole.textContent = t.role;
        tAvatar.textContent = initial;
    });
    tPicker.appendChild(btn);
});

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

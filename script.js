document.querySelectorAll(".faq-item").forEach((item) => {
    const q = item.querySelector(".faq-item__q");
    q.addEventListener("click", () => {
        const wasOpen = item.classList.contains("is-open");
        document.querySelectorAll(".faq-item.is-open").forEach((el) => el.classList.remove("is-open"));
        if (!wasOpen) item.classList.add("is-open");
    });
});

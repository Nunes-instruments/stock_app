(function () {
    "use strict";
    const greeting = document.querySelector("[data-sg-greeting]");
    const dateNode = document.querySelector("[data-sg-date]");
    const timeNode = document.querySelector("[data-sg-time]");

    function tick() {
        const now = new Date();
        const hour = now.getHours();
        if (greeting) {
            greeting.textContent = hour < 12 ? "Good Morning!" : (hour < 17 ? "Good Afternoon!" : "Good Evening!");
        }
        if (dateNode) {
            dateNode.textContent = new Intl.DateTimeFormat(undefined, {
                weekday: "short", day: "2-digit", month: "short", year: "numeric"
            }).format(now);
        }
        if (timeNode) {
            timeNode.textContent = new Intl.DateTimeFormat(undefined, {
                hour: "2-digit", minute: "2-digit"
            }).format(now);
        }
    }

    tick();
    window.setInterval(tick, 30000);
})();

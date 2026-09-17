(() => {
    const counters = document.querySelectorAll("[data-count]");
    const reduceMotion = window.matchMedia &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    counters.forEach((node) => {
        const target = Number(node.dataset.count || 0);
        if (!Number.isFinite(target) || reduceMotion) {
            node.textContent = Math.round(target).toLocaleString();
            return;
        }

        const started = performance.now();
        const duration = 520;

        function tick(now) {
            const progress = Math.min((now - started) / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            node.textContent = Math.round(target * eased).toLocaleString();

            if (progress < 1) {
                requestAnimationFrame(tick);
            }
        }

        requestAnimationFrame(tick);
    });
})();

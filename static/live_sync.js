
(function () {
    "use strict";

    const body = document.body;
    if (!body) return;

    let currentVersion = body.dataset.appVersion || "";
    let currentRevision = Number(body.dataset.inventoryRevision || 0);
    const page = body.dataset.endpoint || "";
    let notice = null;
    let polling = false;

    function ensureNotice() {
        if (notice) return notice;
        notice = document.createElement("div");
        notice.className = "nunes-live-notice";
        notice.hidden = true;
        notice.innerHTML =
            '<div><strong data-live-title>Stock updated</strong>' +
            '<span data-live-copy>New server data is available.</span></div>' +
            '<button type="button" data-live-refresh>Refresh</button>';
        document.body.appendChild(notice);
        notice.querySelector("[data-live-refresh]").addEventListener("click", function () {
            window.location.reload();
        });
        return notice;
    }

    function showNotice(title, copy, refreshLabel) {
        const element = ensureNotice();
        element.querySelector("[data-live-title]").textContent = title;
        element.querySelector("[data-live-copy]").textContent = copy;
        element.querySelector("[data-live-refresh]").textContent = refreshLabel || "Refresh";
        element.hidden = false;
    }

    function pageIsSafeForAutoRefresh() {
        if (!["dashboard", "current_stock", "import_history", "storage_view"].includes(page)) {
            return false;
        }
        if (page === "storage_view") {
            const modal = document.getElementById("shelfAttachModal");
            if (modal && !modal.hidden) return false;
        }
        const drawer = document.getElementById("productDetailsDrawer");
        if (drawer && !drawer.classList.contains("hidden")) return false;
        const active = document.activeElement;
        if (active && ["INPUT", "SELECT", "TEXTAREA"].includes(active.tagName)) return false;
        return true;
    }

    async function poll() {
        if (polling || document.hidden) return;
        polling = true;
        try {
            const response = await fetch("/api/system/state", {
                headers: { "Accept": "application/json" },
                cache: "no-store"
            });
            if (!response.ok) throw new Error("state unavailable");
            const state = await response.json();

            if (currentVersion && state.version && state.version !== currentVersion) {
                showNotice(
                    "Server updated",
                    pageIsSafeForAutoRefresh()
                        ? "A new NUNES Stock release is live. Loading it now…"
                        : "A new NUNES Stock release is live. Your current work is kept; reload when ready.",
                    "Reload now"
                );
                if (pageIsSafeForAutoRefresh()) {
                    window.setTimeout(function () { window.location.reload(); }, 1200);
                }
                return;
            }

            const nextRevision = Number(state.inventory_revision || 0);
            if (nextRevision > currentRevision) {
                currentRevision = nextRevision;
                body.dataset.inventoryRevision = String(nextRevision);

                if (pageIsSafeForAutoRefresh()) {
                    showNotice(
                        "Live stock changed",
                        "Another staff member updated inventory. Refreshing the latest values…",
                        "Refresh now"
                    );
                    window.setTimeout(function () { window.location.reload(); }, 900);
                } else {
                    showNotice(
                        "Live stock changed",
                        "Another user updated inventory. Your current work is kept; refresh when ready.",
                        "Refresh"
                    );
                }
            }
        } catch (error) {
            // Keep the current page usable during a short network/server interruption.
        } finally {
            polling = false;
        }
    }

    window.setInterval(poll, 5000);
    window.setTimeout(poll, 2500);
})();

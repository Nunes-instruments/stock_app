/* ============================================================
   PRODUCT IMAGE + SOURCE LINK ENRICHMENT
   - Missing images are looked up once and cached by Flask.
   - The API also returns the originating product webpage + match status.
   - Existing callers can keep using ProductImages.resolve() for image URL only.
============================================================ */
(function () {
    "use strict";

    const resolvedInfo = new Map();
    const pending = new Map();
    const queue = [];
    let active = 0;
    const MAX_CONCURRENT = 2;

    function clean(value) {
        return String(value || "").trim();
    }

    function key(name, brand, model) {
        return [name, brand, model].map(clean).join("|").toUpperCase();
    }

    function apiUrl(name, brand, model) {
        const params = new URLSearchParams();
        params.set("product_name", clean(name));
        if (clean(brand)) params.set("brand", clean(brand));
        if (clean(model)) params.set("model", clean(model));
        return "/api/product-image?" + params.toString();
    }

    function normalizeInfo(data, knownUrl) {
        data = data || {};
        return {
            success: Boolean(data.success || clean(knownUrl)),
            image_url: clean(data.image_url || knownUrl),
            product_url: clean(data.product_url),
            source_url: clean(data.source_url),
            source_name: clean(data.source_name),
            title: clean(data.title),
            match_status: clean(data.match_status || (knownUrl ? "Image available" : "Not checked")),
            match_score: Number(data.match_score || 0),
            page_status: clean(data.page_status || "Not checked"),
            http_status: data.http_status || null,
            verified: Boolean(data.verified),
            cached: Boolean(data.cached)
        };
    }

    function pump() {
        while (active < MAX_CONCURRENT && queue.length) {
            const job = queue.shift();
            active += 1;
            job().finally(function () {
                active -= 1;
                pump();
            });
        }
    }

    function resolveInfo(name, brand, model, knownUrl, knownInfo) {
        name = clean(name);
        brand = clean(brand);
        model = clean(model);
        knownUrl = clean(knownUrl);

        const cacheKey = key(name, brand, model);

        if (knownInfo && typeof knownInfo === "object" && clean(knownInfo.product_url)) {
            const info = normalizeInfo(knownInfo, knownUrl);
            resolvedInfo.set(cacheKey, info);
            return Promise.resolve(info);
        }

        if (!name) {
            return Promise.resolve(normalizeInfo({}, knownUrl));
        }

        if (resolvedInfo.has(cacheKey)) {
            return Promise.resolve(resolvedInfo.get(cacheKey));
        }
        if (pending.has(cacheKey)) {
            return pending.get(cacheKey);
        }

        let finish;
        const promise = new Promise(function (resolvePromise) {
            finish = resolvePromise;
        });
        pending.set(cacheKey, promise);

        queue.push(async function () {
            let info = normalizeInfo({}, knownUrl);
            try {
                const response = await fetch(apiUrl(name, brand, model), {
                    method: "GET",
                    headers: { "Accept": "application/json" },
                    cache: "no-store"
                });
                const data = await response.json().catch(function () { return {}; });
                info = normalizeInfo(data, knownUrl);
            } catch (error) {
                info = normalizeInfo({}, knownUrl);
            }

            resolvedInfo.set(cacheKey, info);
            pending.delete(cacheKey);
            finish(info);
            return info;
        });

        pump();
        return promise;
    }

    function resolve(name, brand, model, knownUrl) {
        return resolveInfo(name, brand, model, knownUrl).then(function (info) {
            return clean(info.image_url);
        });
    }

    function applyImage(img, url) {
        if (!img || !url) return;
        const frame = img.closest(".auto-product-image-frame") || img.parentElement;
        const fallback = frame ? frame.querySelector(".auto-product-fallback") : null;

        img.onload = function () {
            img.classList.add("is-loaded");
            if (fallback) fallback.style.display = "none";
        };
        img.onerror = function () {
            img.classList.remove("is-loaded");
            img.removeAttribute("src");
            if (fallback) fallback.style.display = "grid";
        };
        img.src = url;
    }

    function statusClass(status) {
        const text = clean(status).toLowerCase();
        if (text.indexOf("verified") >= 0 && text.indexOf("not verified") < 0) return "verified";
        if (text.indexOf("strong") >= 0) return "strong";
        if (text.indexOf("possible") >= 0) return "possible";
        if (text.indexOf("local") >= 0) return "local";
        if (text.indexOf("no ") >= 0 || text.indexOf("not verified") >= 0 || text.indexOf("image only") >= 0) return "unverified";
        return "pending";
    }

    function applyInfoToScope(scope, info) {
        if (!scope || !info) return;

        scope.querySelectorAll("[data-product-link-status]").forEach(function (element) {
            const status = clean(info.match_status) || "Not checked";
            element.textContent = status;
            element.classList.remove("verified", "strong", "possible", "local", "unverified", "pending");
            element.classList.add(statusClass(status));
        });

        scope.querySelectorAll("[data-product-match-score]").forEach(function (element) {
            if (info.match_score > 0) {
                element.textContent = String(Math.round(info.match_score)) + "% match";
                element.hidden = false;
            } else {
                element.textContent = "";
                element.hidden = true;
            }
        });

        scope.querySelectorAll("[data-product-source-link]").forEach(function (element) {
            if (clean(info.product_url)) {
                element.href = info.product_url;
                element.hidden = false;
                element.setAttribute("title", info.title || "Open source product page");
            } else {
                element.removeAttribute("href");
                element.hidden = true;
            }
        });

        scope.querySelectorAll("[data-product-page-status]").forEach(function (element) {
            const text = clean(info.page_status) || "Not checked";
            element.textContent = text;
            element.classList.remove("available", "out", "discontinued", "active", "unknown");
            const lower = text.toLowerCase();
            if (lower === "available") element.classList.add("available");
            else if (lower.indexOf("out of stock") >= 0) element.classList.add("out");
            else if (lower.indexOf("discontinued") >= 0) element.classList.add("discontinued");
            else if (lower.indexOf("page active") >= 0) element.classList.add("active");
            else element.classList.add("unknown");
        });

        scope.querySelectorAll("[data-product-source-name]").forEach(function (element) {
            const text = clean(info.source_name || info.title);
            element.textContent = text;
            element.hidden = !text;
        });
    }

    function readIdentity(element) {
        return {
            name: element.dataset.productName || "",
            brand: element.dataset.productBrand || "",
            model: element.dataset.productModel || "",
            knownUrl: element.dataset.knownUrl || ""
        };
    }

    function hydrate(root) {
        const scope = root || document;
        const elements = scope.querySelectorAll("img[data-auto-product-image]");

        elements.forEach(function (img) {
            if (img.dataset.imageHydrated === "1") return;
            img.dataset.imageHydrated = "1";

            const identity = readIdentity(img);
            const knownUrl = img.getAttribute("src") || identity.knownUrl || "";
            const rowScope = img.closest("[data-product-enrichment-scope]") || img.closest("tr") || img.parentElement;

            resolveInfo(identity.name, identity.brand, identity.model, knownUrl).then(function (info) {
                if (info.image_url) applyImage(img, info.image_url);
                applyInfoToScope(rowScope, info);
            });
        });

        scope.querySelectorAll("[data-product-link-status][data-product-name]").forEach(function (statusEl) {
            if (statusEl.dataset.linkHydrated === "1") return;
            statusEl.dataset.linkHydrated = "1";
            const identity = readIdentity(statusEl);
            const rowScope = statusEl.closest("[data-product-enrichment-scope]") || statusEl.closest("tr") || statusEl.parentElement;
            resolveInfo(identity.name, identity.brand, identity.model, identity.knownUrl).then(function (info) {
                applyInfoToScope(rowScope, info);
            });
        });
    }

    window.ProductImages = {
        resolve: resolve,
        resolveInfo: resolveInfo,
        hydrate: hydrate,
        applyInfoToScope: applyInfoToScope
    };

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", function () {
            hydrate(document);
        });
    } else {
        hydrate(document);
    }
})();

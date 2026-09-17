/* ============================================================
   NUNES STOCK MANAGEMENT
   FAST HORIZONTAL 3D SHELF VIEW
   shelf_rack_3d.js
   VERSION 5.5

   STORAGE-ONLY UPDATE
   ------------------------------------------------------------
   - Default: 3 wide horizontal racks
   - + Rack adds another rack instantly (client-side layout only)
   - Existing products render immediately from embedded JSON
   - New products appear automatically after Add Stock / Excel import
   - Click product -> details + strict verified real-product image preview
   - Left-drag empty area = tilt / rotate
   - Right-click + drag = pan scene in any direction
   - Wheel = zoom
   - + / - stock buttons keep the existing /stock-movement endpoint
   - Attach Excel keeps the existing /import-excel endpoint
   - Existing Open Rack remains unchanged
============================================================ */

(function () {
    "use strict";

    const app = document.getElementById("storageViewApp");
    const stage = document.getElementById("shelfRackStage");
    const wrap = document.getElementById("shelfRackCanvasWrap");
    const viewport = document.getElementById("shelfRackFastViewport");
    const world = document.getElementById("shelfRackFastWorld");

    if (!app || !stage || !wrap || !viewport || !world) return;

    const activeBranch = String(app.dataset.activeBranch || "main").trim().toLowerCase();
    const isMainBranch = activeBranch === "main";

    const shelfButton = document.getElementById("shelfRackModeButton");
    const openButton = document.getElementById("openRackModeButton");
    const openToolbar = document.getElementById("openRackToolbar");
    const openStage = document.getElementById("storageAnimationStage");

    const addButton = document.getElementById("shelfRackQuickAdd");
    const removeButton = document.getElementById("shelfRackQuickRemove");
    const addRackButton = document.getElementById("shelfRackAddRack");
    const removeRackButton = document.getElementById("shelfRackRemoveRack");
    const fileInput = document.getElementById("shelfRackFileInput");
    const footer = document.getElementById("shelfRackSceneFooter");
    const busy = document.getElementById("shelfRackBusy");
    const busyText = document.getElementById("shelfRackBusyText");
    const sceneTitle = document.getElementById("shelfRackSceneTitle");
    const sceneDescription = document.getElementById("shelfRackSceneDescription");

    const detailName = document.getElementById("shelfRackDetailName");
    const detailMeta = document.getElementById("shelfRackDetailMeta");
    const detailId = document.getElementById("shelfRackDetailId");
    const detailStock = document.getElementById("shelfRackDetailStock");
    const detailCategory = document.getElementById("shelfRackDetailCategory");
    const detailPosition = document.getElementById("shelfRackDetailPosition");
    const detailBrand = document.getElementById("shelfRackDetailBrand");
    const detailModel = document.getElementById("shelfRackDetailModel");
    const detailLocation = document.getElementById("shelfRackDetailLocation");
    const detailUnit = document.getElementById("shelfRackDetailUnit");
    const saveProductButton = document.getElementById("shelfRackSaveProduct");
    const saveProductStatus = document.getElementById("shelfRackSaveStatus");

    const previewImage = document.getElementById("shelfRackProductPreviewImage");
    const previewEmpty = document.getElementById("shelfRackProductPreviewEmpty");
    const previewStatus = document.getElementById("shelfRackProductPreviewStatus");
    const previewSource = document.getElementById("shelfRackProductPreviewSource");
    const retryImageButton = document.getElementById("shelfRackRetryImage");
    let previewRequestToken = 0;

    function safe(value, fallback) {
        const text = String(value === null || value === undefined ? "" : value).trim();
        return text || (fallback || "");
    }

    function numberValue(value) {
        const n = Number(value);
        return Number.isFinite(n) ? n : 0;
    }

    function formatQuantity(value, unit) {
        const n = numberValue(value);
        const text = Number.isInteger(n)
            ? String(n)
            : n.toLocaleString(undefined, { maximumFractionDigits: 2 });
        return text + " " + safe(unit, "Nos");
    }

    function escapeHtml(value) {
        return String(value === null || value === undefined ? "" : value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/\"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function setBusy(on, text) {
        if (busyText && text) busyText.textContent = text;
        if (!busy) return;
        busy.classList.toggle("active", !!on);
        busy.setAttribute("aria-hidden", on ? "false" : "true");
    }

    function readProducts() {
        const data = document.getElementById("storageProductsData");
        if (!data) return [];
        try {
            const parsed = JSON.parse(data.textContent || "[]");
            return Array.isArray(parsed) ? parsed : [];
        } catch (error) {
            console.error("ShelfRack3D: product JSON error", error);
            return [];
        }
    }

    const products = readProducts();
    products.sort(function (a, b) {
        const ak = safe(a.category) + "|" + safe(a.product_name) + "|" + safe(a.product_id);
        const bk = safe(b.category) + "|" + safe(b.product_name) + "|" + safe(b.product_id);
        return ak.localeCompare(bk);
    });

    let selectedProduct = null;
    let selectedCard = null;

    /* ========================================================
       MODE SWITCH
    ======================================================== */

    function focusStage(target) {
        if (!target || typeof target.scrollIntoView !== "function") return;
        window.setTimeout(function () {
            target.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 20);
    }

    function showShelfRack(options) {
        stage.classList.remove("hidden");
        stage.style.display = "block";
        if (openToolbar) openToolbar.style.display = "none";
        if (openStage) openStage.style.display = "none";
        if (shelfButton) shelfButton.classList.add("active");
        if (openButton) openButton.classList.remove("active");
        if (!options || options.scroll !== false) focusStage(stage);
    }

    function showOpenRack(options) {
        if (!isMainBranch) return;
        stage.classList.add("hidden");
        stage.style.display = "none";
        if (openToolbar) openToolbar.style.display = "grid";
        if (openStage) openStage.style.display = "block";
        if (shelfButton) shelfButton.classList.remove("active");
        if (openButton) openButton.classList.add("active");
        if (window.Stock3D && typeof window.Stock3D.resize === "function") {
            window.setTimeout(function () { window.Stock3D.resize(); }, 40);
        }
        if (!options || options.scroll !== false) focusStage(openStage);
    }

    if (shelfButton) {
        shelfButton.addEventListener("click", function (event) {
            event.preventDefault();
            showShelfRack();
        });
    }

    if (openButton) {
        openButton.addEventListener("click", function (event) {
            event.preventDefault();
            showOpenRack();
        });
    }

    showShelfRack({ scroll: false });

    /* ========================================================
       HORIZONTAL RACK LAYOUT
       Default = 3 racks. User can add more with + Rack.
    ======================================================== */

    const shelvesPerRack = 5;
    const rackStorageKey = "nunes_horizontal_rack_count_v53_" + activeBranch;

    let rackCount = 3;
    try {
        const storedRackCount = parseInt(window.localStorage.getItem(rackStorageKey) || "3", 10);
        if (Number.isFinite(storedRackCount)) rackCount = Math.max(1, Math.min(12, storedRackCount));
    } catch (ignore) {}

    function initials(product) {
        const name = safe(product.product_name, "Product");
        const parts = name.split(/\s+/).filter(Boolean);
        return ((parts[0] ? parts[0][0] : "P") + (parts[1] ? parts[1][0] : "")).toUpperCase();
    }

    function makeShelfBuckets() {
        const totalShelves = rackCount * shelvesPerRack;
        const buckets = Array.from({ length: totalShelves }, function () { return []; });

        products.forEach(function (product, index) {
            buckets[index % totalShelves].push({
                product: product,
                productIndex: index
            });
        });

        return buckets;
    }

    function productCardHtml(entry, rackNumber, shelfNumber) {
        const product = entry.product;
        const stock = numberValue(product.current_quantity);
        const stockText = Number.isInteger(stock) ? String(stock) : String(Math.round(stock * 100) / 100);
        const pos = "Rack " + rackNumber + " · Shelf " + shelfNumber;

        return [
            '<button type="button" class="fast-rack-product"',
            ' data-product-index="', entry.productIndex, '"',
            ' data-rack-position="', escapeHtml(pos), '"',
            ' title="', escapeHtml(safe(product.product_name, "Product")), '">',
                '<span class="fast-rack-package-mark">', escapeHtml(initials(product)), '</span>',
                '<span class="fast-rack-package-name">', escapeHtml(safe(product.product_name, "Product")), '</span>',
                '<span class="fast-rack-package-stock" data-stock-for="', entry.productIndex, '">',
                    escapeHtml(stockText),
                '</span>',
            '</button>'
        ].join("");
    }

    function buildRackHtml(rackIndex, shelfBuckets) {
        const rackNumber = rackIndex + 1;
        const shelves = [];

        for (let shelfIndex = 0; shelfIndex < shelvesPerRack; shelfIndex += 1) {
            const shelfNumber = shelfIndex + 1;
            const bucketIndex = rackIndex * shelvesPerRack + shelfIndex;
            const items = shelfBuckets[bucketIndex] || [];
            const productsHtml = items.length
                ? items.map(function (entry) {
                    return productCardHtml(entry, rackNumber, shelfNumber);
                }).join("")
                : '<span class="fast-rack-empty-slot"></span>';

            shelves.push(
                '<div class="fast-rack-shelf" data-rack="' + rackNumber + '" data-shelf="' + shelfNumber + '">' +
                    '<div class="fast-rack-shelf-products">' + productsHtml + '</div>' +
                    '<span class="fast-rack-shelf-edge"></span>' +
                '</div>'
            );
        }

        return [
            '<section class="fast-rack-unit" aria-label="Rack ', rackNumber, '">',
                '<div class="fast-rack-header">',
                    '<strong>RACK ', rackNumber, '</strong>',
                    '<span>', shelvesPerRack, ' shelves</span>',
                '</div>',
                '<div class="fast-rack-frame">',
                    '<span class="fast-rack-post fast-rack-post-left"></span>',
                    '<span class="fast-rack-post fast-rack-post-right"></span>',
                    shelves.join(""),
                '</div>',
                '<div class="fast-rack-base"></div>',
            '</section>'
        ].join("");
    }

    function updateRackLabels() {
        if (sceneTitle) sceneTitle.textContent = "3D Shelf Rack · " + rackCount + " Horizontal Racks";
        if (sceneDescription) {
            sceneDescription.textContent = "Products are arranged across wide horizontal racks. Left-drag to tilt, right-click + drag to move the scene, scroll to zoom, and click a product for its verified image preview.";
        }
        if (footer) footer.textContent = rackCount + " racks · " + products.length + " products · ready";
        world.setAttribute("aria-label", rackCount + " horizontal storage racks");
        if (removeRackButton) removeRackButton.disabled = rackCount <= 1;
    }

    function renderRacks(options) {
        const selectedId = selectedProduct ? safe(selectedProduct.product_id) : "";
        const shelfBuckets = makeShelfBuckets();

        world.innerHTML = Array.from({ length: rackCount }, function (_, rackIndex) {
            return buildRackHtml(rackIndex, shelfBuckets);
        }).join("");

        world.classList.add("ready");
        updateRackLabels();

        let targetCard = null;
        if (options && options.keepSelection && selectedId) {
            const candidates = world.querySelectorAll(".fast-rack-product");
            for (let i = 0; i < candidates.length; i += 1) {
                const idx = Number(candidates[i].dataset.productIndex);
                if (Number.isInteger(idx) && products[idx] && safe(products[idx].product_id) === selectedId) {
                    targetCard = candidates[i];
                    break;
                }
            }
        }

        if (!targetCard) targetCard = world.querySelector(".fast-rack-product");
        if (targetCard) selectCard(targetCard, false);
    }

    if (addRackButton) {
        addRackButton.addEventListener("click", function () {
            if (rackCount >= 12) {
                window.alert("Maximum 12 racks reached.");
                return;
            }
            rackCount += 1;
            try { window.localStorage.setItem(rackStorageKey, String(rackCount)); } catch (ignore) {}
            renderRacks({ keepSelection: true });
            if (footer) footer.textContent = "Rack " + rackCount + " added · " + products.length + " products arranged";
        });
    }

    if (removeRackButton) {
        removeRackButton.addEventListener("click", function () {
            if (rackCount <= 1) return;
            rackCount -= 1;
            try { window.localStorage.setItem(rackStorageKey, String(rackCount)); } catch (ignore) {}
            renderRacks({ keepSelection: true });
            if (footer) footer.textContent = "Last rack removed · " + rackCount + " racks remain";
        });
    }

    /* ========================================================
       PRODUCT DETAILS + PRODUCT-SPECIFIC 3D PREVIEW
    ======================================================== */

    function identityText(info) {
        return [safe(info && info.title), safe(info && info.product_url), safe(info && info.source_name)]
            .join(" ")
            .toLowerCase();
    }

    function productTokens(value) {
        return safe(value)
            .toLowerCase()
            .match(/[a-z0-9]+/g) || [];
    }

    function embeddedImageIsStrict(product, info) {
        if (!product || !info || !safe(info.image_url) || !safe(info.product_url)) return false;
        const haystack = identityText(info);
        const tokens = productTokens(product.product_name).filter(function (token) {
            return token.length >= 3 && !["the", "and", "for", "with", "instrument", "product"].includes(token);
        });
        if (tokens.length) {
            const matched = tokens.filter(function (token) { return haystack.indexOf(token) >= 0; }).length;
            if ((matched / tokens.length) < 0.80) return false;
        }
        const brand = safe(product.brand).toLowerCase();
        const model = safe(product.model).toLowerCase();
        if (brand && haystack.indexOf(brand) < 0) return false;
        if (model && haystack.indexOf(model) < 0) return false;
        const minimum = model ? 68 : 40;
        return numberValue(info.match_score) >= minimum;
    }

    function showPreviewEmpty(message) {
        if (previewImage) {
            previewImage.hidden = true;
            previewImage.removeAttribute("src");
            previewImage.alt = "";
        }
        if (previewEmpty) {
            previewEmpty.hidden = false;
            previewEmpty.textContent = message || "No verified product image.";
        }
        if (previewSource) {
            previewSource.hidden = true;
            previewSource.removeAttribute("href");
        }
    }

    function showVerifiedPreview(product, info, statusText) {
        if (!previewImage || !safe(info && info.image_url)) return false;
        const imageUrl = safe(info.image_url);
        const tokenAtLoad = previewRequestToken;

        previewImage.onload = function () {
            if (tokenAtLoad !== previewRequestToken) return;
            previewImage.hidden = false;
            if (previewEmpty) previewEmpty.hidden = true;
        };
        previewImage.onerror = function () {
            if (tokenAtLoad !== previewRequestToken) return;
            showPreviewEmpty("Verified source was found, but its image could not be displayed.");
            if (previewStatus) previewStatus.textContent = "Verified image unavailable";
        };
        previewImage.alt = safe(product.product_name, "Product image");
        previewImage.hidden = true;
        previewImage.src = imageUrl;

        if (previewStatus) {
            previewStatus.textContent = statusText || "Verified product image";
        }
        if (previewSource && safe(info.product_url)) {
            previewSource.href = info.product_url;
            previewSource.hidden = false;
        } else if (previewSource) {
            previewSource.hidden = true;
            previewSource.removeAttribute("href");
        }
        return true;
    }

    async function updateProductPreview(product, forceSearch) {
        if (!product) return;
        const requestToken = ++previewRequestToken;
        const cachedInfo = product.image_info || {};

        // If the page already contains a strict cached match, show it instantly.
        if (!forceSearch && embeddedImageIsStrict(product, cachedInfo)) {
            showVerifiedPreview(product, cachedInfo, "Verified cached product image");
            return;
        }

        showPreviewEmpty("Searching for the exact product image…");
        if (previewStatus) previewStatus.textContent = "Checking verified online source…";

        const params = new URLSearchParams();
        params.set("product_name", safe(product.product_name));
        if (safe(product.brand)) params.set("brand", safe(product.brand));
        if (safe(product.model)) params.set("model", safe(product.model));
        if (forceSearch) params.set("force", "1");

        try {
            const response = await fetch("/api/product-preview-image?" + params.toString(), {
                method: "GET",
                headers: { "Accept": "application/json" },
                cache: "no-store"
            });
            const info = await response.json().catch(function () { return {}; });
            if (requestToken !== previewRequestToken) return;

            if (response.ok && info.success && info.preview_verified && safe(info.image_url)) {
                product.image_url = info.image_url;
                product.image_info = info;
                showVerifiedPreview(product, info, "Verified online product image");
                return;
            }

            showPreviewEmpty("No verified product image found. A similar-looking image was not used.");
            if (previewStatus) previewStatus.textContent = "No verified image — not showing a guess";
        } catch (error) {
            if (requestToken !== previewRequestToken) return;
            showPreviewEmpty("Could not verify an online product image right now.");
            if (previewStatus) previewStatus.textContent = "Image verification unavailable";
        }
    }

    function updateDetails(product, positionLabel) {
        if (!product) return;
        selectedProduct = product;

        if (detailName) detailName.value = safe(product.product_name, "Product");
        if (detailMeta) {
            detailMeta.textContent = "Edit the fields below and click Save Changes.";
        }
        if (detailId) detailId.value = safe(product.product_id, "");
        if (detailStock) detailStock.value = String(numberValue(product.current_quantity));
        if (detailCategory) detailCategory.value = safe(product.category, "");
        if (detailPosition) detailPosition.value = safe(positionLabel, "-");
        if (detailBrand) detailBrand.value = safe(product.brand, "");
        if (detailModel) detailModel.value = safe(product.model, "");
        if (detailLocation) detailLocation.value = safe(product.location, "Category Storage");
        if (detailUnit) detailUnit.value = safe(product.unit, "Nos");

        updateProductPreview(product);

        if (saveProductButton) saveProductButton.disabled = false;
        if (saveProductStatus) saveProductStatus.textContent = "Ready to edit.";
        if (retryImageButton) retryImageButton.disabled = false;
        if (addButton) addButton.disabled = false;
        if (removeButton) removeButton.disabled = numberValue(product.current_quantity) <= 0;
    }

    async function saveSelectedProduct() {
        if (!selectedProduct || !saveProductButton) return;

        const oldId = safe(selectedProduct.product_id);
        const desiredStock = Number(detailStock ? detailStock.value : selectedProduct.current_quantity);
        if (!Number.isFinite(desiredStock) || desiredStock < 0) {
            if (saveProductStatus) saveProductStatus.textContent = "Stock must be 0 or greater.";
            return;
        }

        const payload = {
            product_id: safe(detailId && detailId.value),
            product_name: safe(detailName && detailName.value),
            category: safe(detailCategory && detailCategory.value),
            brand: safe(detailBrand && detailBrand.value),
            model: safe(detailModel && detailModel.value),
            location: safe(detailLocation && detailLocation.value),
            unit: safe(detailUnit && detailUnit.value, "Nos"),
            current_quantity: desiredStock
        };

        if (!payload.product_id || !payload.product_name || !payload.category) {
            if (saveProductStatus) saveProductStatus.textContent = "Product ID, Product Name and Category are required.";
            return;
        }

        saveProductButton.disabled = true;
        if (saveProductStatus) saveProductStatus.textContent = "Saving…";
        setBusy(true, "Saving product changes…");

        try {
            const response = await fetch("/api/product/" + encodeURIComponent(oldId) + "/edit", {
                method: "PUT",
                headers: { "Accept": "application/json", "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
            const result = await response.json().catch(function () { return {}; });
            if (!response.ok || !result.success || !result.product) {
                throw new Error(result.message || "Unable to save product changes.");
            }

            Object.keys(selectedProduct).forEach(function (key) {
                if (key === "image_info" || key === "image_url") delete selectedProduct[key];
            });
            Object.assign(selectedProduct, result.product);
            selectedProduct.image_info = {};
            selectedProduct.image_url = "";

            if (saveProductStatus) saveProductStatus.textContent = "Saved.";
            renderRacks({ keepSelection: true });
        } catch (error) {
            if (saveProductStatus) saveProductStatus.textContent = error.message || "Save failed.";
            window.alert(error.message || "Unable to save product changes.");
        } finally {
            saveProductButton.disabled = !selectedProduct;
            setBusy(false);
        }
    }

    if (saveProductButton) {
        saveProductButton.addEventListener("click", saveSelectedProduct);
    }

    if (retryImageButton) {
        retryImageButton.addEventListener("click", function () {
            if (!selectedProduct) return;
            updateProductPreview(selectedProduct, true);
        });
    }

    function selectCard(card, scrollIntoView) {
        if (!card) return;
        const index = Number(card.dataset.productIndex);
        if (!Number.isInteger(index) || !products[index]) return;

        if (selectedCard) selectedCard.classList.remove("selected");
        selectedCard = card;
        selectedCard.classList.add("selected");

        updateDetails(products[index], card.dataset.rackPosition || "-");

        if (scrollIntoView && typeof card.scrollIntoView === "function") {
            card.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
        }
    }

    world.addEventListener("click", function (event) {
        const card = event.target.closest(".fast-rack-product");
        if (card && world.contains(card)) selectCard(card, false);
    });

    renderRacks();

    /* ========================================================
       LIGHTWEIGHT 3D INTERACTION
       Left drag = tilt/rotate
       Right drag = pan X/Y
       Wheel = zoom
       Double click empty area = reset camera
    ======================================================== */

    let yaw = -2;
    let pitch = 2;
    let zoom = 1;
    let panX = 0;
    let panY = 0;
    let dragging = false;
    let dragMode = "rotate";
    let startX = 0;
    let startY = 0;
    let lastX = 0;
    let lastY = 0;

    function applyWorldTransform() {
        world.style.transform =
            "translate3d(" + panX + "px," + panY + "px,0) " +
            "rotateX(" + pitch + "deg) rotateY(" + yaw + "deg) scale(" + zoom + ")";
    }

    applyWorldTransform();

    viewport.addEventListener("contextmenu", function (event) {
        event.preventDefault();
    });

    viewport.addEventListener("pointerdown", function (event) {
        const rightButton = event.button === 2;
        const productCard = event.target.closest(".fast-rack-product");

        // Normal left-click on a product remains a product selection.
        if (productCard && !rightButton) return;

        dragging = true;
        dragMode = rightButton ? "pan" : "rotate";
        startX = lastX = event.clientX;
        startY = lastY = event.clientY;

        viewport.classList.toggle("panning", dragMode === "pan");
        viewport.classList.toggle("dragging", dragMode === "rotate");

        if (viewport.setPointerCapture) viewport.setPointerCapture(event.pointerId);
        event.preventDefault();
    });

    viewport.addEventListener("pointermove", function (event) {
        if (!dragging) return;

        const dx = event.clientX - lastX;
        const dy = event.clientY - lastY;

        if (dragMode === "pan") {
            panX += dx;
            panY += dy;
        } else {
            yaw = Math.max(-13, Math.min(13, yaw + dx * 0.035));
            pitch = Math.max(-4, Math.min(10, pitch - dy * 0.025));
        }

        lastX = event.clientX;
        lastY = event.clientY;
        applyWorldTransform();
    });

    function stopDragging() {
        dragging = false;
        viewport.classList.remove("dragging");
        viewport.classList.remove("panning");
    }

    viewport.addEventListener("pointerup", stopDragging);
    viewport.addEventListener("pointercancel", stopDragging);
    viewport.addEventListener("pointerleave", function (event) {
        if (dragging && event.buttons === 0) stopDragging();
    });

    viewport.addEventListener("wheel", function (event) {
        if (event.ctrlKey) return;
        event.preventDefault();
        zoom = Math.max(0.68, Math.min(1.35, zoom - event.deltaY * 0.0006));
        applyWorldTransform();
    }, { passive: false });

    viewport.addEventListener("dblclick", function (event) {
        if (event.target.closest(".fast-rack-product")) return;
        yaw = -2;
        pitch = 2;
        zoom = 1;
        panX = 0;
        panY = 0;
        applyWorldTransform();
    });

    /* ========================================================
       QUICK +1 / -1 USING EXISTING STOCK API
    ======================================================== */

    function refreshSelectedStockDisplay() {
        if (!selectedProduct || !selectedCard) return;
        const index = Number(selectedCard.dataset.productIndex);
        const stockBadge = selectedCard.querySelector('[data-stock-for="' + index + '"]');
        if (stockBadge) {
            const n = numberValue(selectedProduct.current_quantity);
            stockBadge.textContent = Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
        }
        if (detailStock) detailStock.textContent = formatQuantity(selectedProduct.current_quantity, selectedProduct.unit);
    }

    async function moveOne(movementType) {
        if (!selectedProduct) return;
        if (movementType === "outward" && numberValue(selectedProduct.current_quantity) <= 0) return;

        setBusy(true, movementType === "inward" ? "Adding one unit…" : "Removing one unit…");
        if (addButton) addButton.disabled = true;
        if (removeButton) removeButton.disabled = true;

        try {
            const response = await fetch("/stock-movement", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    product_id: selectedProduct.product_id,
                    movement_type: movementType,
                    quantity: 1,
                    category: selectedProduct.category,
                    product_name: selectedProduct.product_name,
                    brand: selectedProduct.brand || "",
                    model: selectedProduct.model || "",
                    unit: selectedProduct.unit || "Nos",
                    location: selectedProduct.location || "",
                    reason: movementType === "inward" ? "rack_quick_add" : "rack_quick_remove",
                    reason_label: movementType === "inward" ? "Shelf Rack +1" : "Shelf Rack -1",
                    remarks: "Quick shelf rack adjustment"
                })
            });

            let payload = {};
            try { payload = await response.json(); } catch (ignore) {}
            if (!response.ok || payload.success === false) {
                throw new Error(payload.error || payload.message || "Unable to update stock.");
            }

            const result = payload.result || {};
            selectedProduct.current_quantity = result.new_quantity !== undefined
                ? numberValue(result.new_quantity)
                : (movementType === "inward"
                    ? numberValue(selectedProduct.current_quantity) + 1
                    : Math.max(0, numberValue(selectedProduct.current_quantity) - 1));

            refreshSelectedStockDisplay();
            if (footer) {
                footer.textContent = "Stock updated · " + safe(selectedProduct.product_name, "Product") + " · " + formatQuantity(selectedProduct.current_quantity, selectedProduct.unit);
            }
        } catch (error) {
            window.alert(error.message || "Unable to update stock.");
        } finally {
            setBusy(false);
            if (addButton) addButton.disabled = !selectedProduct;
            if (removeButton) removeButton.disabled = !selectedProduct || numberValue(selectedProduct.current_quantity) <= 0;
        }
    }

    if (addButton) addButton.addEventListener("click", function () { moveOne("inward"); });
    if (removeButton) removeButton.addEventListener("click", function () { moveOne("outward"); });

    /* ========================================================
       EXCEL IMPORT USING EXISTING IMPORT ROUTE
    ======================================================== */

    if (fileInput) {
        fileInput.addEventListener("change", async function () {
            const file = fileInput.files && fileInput.files[0];
            if (!file) return;
            if (!file.name.toLowerCase().endsWith(".xlsx")) {
                window.alert("Please select an .xlsx file.");
                fileInput.value = "";
                return;
            }

            setBusy(true, "Importing Excel…");
            const form = new FormData();
            form.append("excel_file", file);

            try {
                const response = await fetch("/import-excel", {
                    method: "POST",
                    body: form,
                    credentials: "same-origin"
                });
                if (!response.ok) throw new Error("Excel import failed.");
                window.location.reload();
            } catch (error) {
                setBusy(false);
                window.alert(error.message || "Unable to import the Excel file.");
                fileInput.value = "";
            }
        });
    }

    window.ShelfRack3D = {
        showShelfRack: showShelfRack,
        showOpenRack: showOpenRack,
        products: products,
        refresh: function () { renderRacks({ keepSelection: true }); },
        addRack: function () {
            if (addRackButton) addRackButton.click();
        }
    };
})();

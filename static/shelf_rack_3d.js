/* ============================================================
   NUNES STOCK MANAGEMENT
   SHARED SHELF RACK CONTROLLER
   shelf_rack_3d.js
   VERSION 6.0 / v3.2.11

   IMPORTANT
   - Rack count and product shelf positions are stored on MAIN SERVER.
   - Every owner/staff browser sees the same layout for the active branch.
   - Attach / move / remove changes physical placement only.
   - Stock quantity remains in the normal products / stock movement tables.
   - Existing Open Rack mode is left unchanged.
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
    const attachTopButton = document.getElementById("shelfRackAttachProduct");
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

    const locationListCard = document.getElementById("shelfLocationListCard");
    const locationListTitle = document.getElementById("shelfLocationListTitle");
    const locationListCopy = document.getElementById("shelfLocationListCopy");
    const locationSearch = document.getElementById("shelfLocationSearch");
    const locationAttachButton = document.getElementById("shelfLocationAttachButton");
    const locationProductList = document.getElementById("shelfLocationProductList");

    const attachModal = document.getElementById("shelfAttachModal");
    const attachClose = document.getElementById("shelfAttachClose");
    const attachTarget = document.getElementById("shelfAttachTarget");
    const attachSearch = document.getElementById("shelfAttachSearch");
    const attachProductList = document.getElementById("shelfAttachProductList");
    const attachRackSelect = document.getElementById("shelfAttachRack");
    const attachShelfSelect = document.getElementById("shelfAttachShelf");

    let previewRequestToken = 0;
    let selectedProduct = null;
    let selectedCard = null;
    let selectedRack = 1;
    let selectedShelf = 1;
    let attachPinnedProductId = "";
    const imageLookupCache = new Map();

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
        const text = Number.isInteger(n) ? String(n) : n.toLocaleString(undefined, { maximumFractionDigits: 2 });
        return text + " " + safe(unit, "Nos");
    }
    function escapeHtml(value) {
        return String(value === null || value === undefined ? "" : value)
            .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
    }
    function setBusy(on, text) {
        if (busyText && text) busyText.textContent = text;
        if (!busy) return;
        busy.classList.toggle("active", !!on);
        busy.setAttribute("aria-hidden", on ? "false" : "true");
    }
    function readJson(id, fallback) {
        const node = document.getElementById(id);
        if (!node) return fallback;
        try { return JSON.parse(node.textContent || ""); } catch (error) { return fallback; }
    }
    function normalize(value) { return safe(value).toLowerCase(); }
    function initials(product) {
        const parts = safe(product && product.product_name, "Product").split(/\s+/).filter(Boolean);
        return ((parts[0] ? parts[0][0] : "P") + (parts[1] ? parts[1][0] : "")).toUpperCase();
    }
    function productHaystack(product) {
        return [product.product_name, product.product_id, product.brand, product.model, product.category]
            .map(normalize).join(" ");
    }

    const inventory = readJson("shelfInventoryData", []);
    inventory.sort(function (a, b) {
        return (safe(a.product_name) + "|" + safe(a.product_id)).localeCompare(safe(b.product_name) + "|" + safe(b.product_id));
    });
    const productMap = new Map(inventory.map(function (p) { return [safe(p.product_id).toUpperCase(), p]; }));

    let state = readJson("shelfRackStateData", { rack_count: 3, shelves_per_rack: 5, positions: [] });
    state.rack_count = Math.max(1, Number(state.rack_count || 3));
    state.shelves_per_rack = Math.max(1, Number(state.shelves_per_rack || 5));
    state.positions = Array.isArray(state.positions) ? state.positions : [];

    function assignmentMap() {
        const map = new Map();
        state.positions.forEach(function (position) {
            map.set(safe(position.product_id).toUpperCase(), position);
        });
        return map;
    }

    async function requestJson(url, options) {
        const response = await fetch(url, Object.assign({
            headers: { "Accept": "application/json" },
            cache: "no-store"
        }, options || {}));
        let payload = {};
        try { payload = await response.json(); } catch (ignore) {}
        if (!response.ok || payload.success === false) {
            throw new Error(payload.message || payload.error || "Request failed.");
        }
        return payload;
    }

    async function reloadState() {
        const payload = await requestJson("/api/shelf-rack/state");
        state = payload.state || state;
        state.rack_count = Math.max(1, Number(state.rack_count || 3));
        state.shelves_per_rack = Math.max(1, Number(state.shelves_per_rack || 5));
        state.positions = Array.isArray(state.positions) ? state.positions : [];
        if (selectedRack > state.rack_count) {
            selectedRack = state.rack_count;
            selectedShelf = 1;
        }
    }

    /* ========================================================
       MODE SWITCH
    ======================================================== */
    function focusStage(target) {
        if (!target || typeof target.scrollIntoView !== "function") return;
        window.setTimeout(function () { target.scrollIntoView({ behavior: "smooth", block: "start" }); }, 20);
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
    if (shelfButton) shelfButton.addEventListener("click", function (event) { event.preventDefault(); showShelfRack(); });
    if (openButton) openButton.addEventListener("click", function (event) { event.preventDefault(); showOpenRack(); });
    showShelfRack({ scroll: false });

    /* ========================================================
       RACK RENDERING — SAME VISUAL LANGUAGE, SERVER POSITIONS
    ======================================================== */
    function positionForProduct(productId) {
        const id = safe(productId).toUpperCase();
        return state.positions.find(function (p) { return safe(p.product_id).toUpperCase() === id; }) || null;
    }
    function productsFor(rackNumber, shelfNumber) {
        const ids = state.positions
            .filter(function (p) {
                return Number(p.rack_number) === Number(rackNumber) &&
                    (shelfNumber === null || Number(p.shelf_number) === Number(shelfNumber));
            })
            .map(function (p) { return safe(p.product_id).toUpperCase(); });
        return ids.map(function (id) { return productMap.get(id); }).filter(Boolean);
    }
    function productCardHtml(product, rackNumber, shelfNumber) {
        const stock = numberValue(product.current_quantity);
        const stockText = Number.isInteger(stock) ? String(stock) : String(Math.round(stock * 100) / 100);
        return [
            '<button type="button" class="fast-rack-product"',
            ' data-product-id="', escapeHtml(safe(product.product_id).toUpperCase()), '"',
            ' data-rack-position="Rack ', rackNumber, ' · Shelf ', shelfNumber, '"',
            ' title="', escapeHtml(safe(product.product_name, "Product")), '">',
                '<span class="fast-rack-package-mark">', escapeHtml(initials(product)), '</span>',
                '<span class="fast-rack-package-name">', escapeHtml(safe(product.product_name, "Product")), '</span>',
                '<span class="fast-rack-package-stock">', escapeHtml(stockText), '</span>',
            '</button>'
        ].join("");
    }
    function buildRackHtml(rackIndex) {
        const rackNumber = rackIndex + 1;
        const shelves = [];
        for (let shelfIndex = 0; shelfIndex < state.shelves_per_rack; shelfIndex += 1) {
            const shelfNumber = shelfIndex + 1;
            const items = productsFor(rackNumber, shelfNumber);
            const selected = selectedRack === rackNumber && selectedShelf === shelfNumber;
            shelves.push(
                '<div class="fast-rack-shelf' + (selected ? ' selected-location' : '') + '" data-rack="' + rackNumber + '" data-shelf="' + shelfNumber + '">' +
                    '<div class="fast-rack-shelf-products">' +
                        (items.length ? items.map(function (p) { return productCardHtml(p, rackNumber, shelfNumber); }).join("") : '<span class="fast-rack-empty-slot"></span>') +
                    '</div>' +
                    '<span class="fast-rack-shelf-edge"></span>' +
                '</div>'
            );
        }
        return [
            '<section class="fast-rack-unit" aria-label="Rack ', rackNumber, '">',
                '<div class="fast-rack-header', (selectedRack === rackNumber && selectedShelf === null ? ' selected-location' : ''), '" data-rack-header="', rackNumber, '">',
                    '<strong>RACK ', rackNumber, '</strong>',
                    '<span>', state.shelves_per_rack, ' shelves · ', productsFor(rackNumber, null).length, ' products</span>',
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
    function renderRacks(options) {
        const selectedId = selectedProduct ? safe(selectedProduct.product_id).toUpperCase() : "";
        world.innerHTML = Array.from({ length: state.rack_count }, function (_, rackIndex) {
            return buildRackHtml(rackIndex);
        }).join("");
        world.classList.add("ready");
        if (sceneTitle) sceneTitle.textContent = "3D Shelf Rack · " + state.rack_count + " Shared Racks";
        if (sceneDescription) sceneDescription.textContent = "Click any shelf to see its product list below. Attach, move or remove shelf placement without changing stock quantity.";
        if (footer) footer.textContent = state.rack_count + " racks · " + state.positions.length + " assigned products · " + inventory.length + " inventory products";
        world.setAttribute("aria-label", state.rack_count + " shared horizontal storage racks");
        if (removeRackButton) removeRackButton.disabled = state.rack_count <= 1;
        renderLocationList();

        if (options && options.keepSelection && selectedId) {
            const card = world.querySelector('[data-product-id="' + CSS.escape(selectedId) + '"]');
            if (card) {
                selectedCard = card;
                card.classList.add("selected");
            }
        }
    }

    /* ========================================================
       LOCATION SELECTION + LIST VIEW
    ======================================================== */
    function currentScopeProducts() {
        if (!selectedRack) return [];
        return productsFor(selectedRack, selectedShelf === null ? null : selectedShelf);
    }
    function currentTargetLabel() {
        if (!selectedRack) return "Select a rack or shelf";
        return selectedShelf === null ? "Rack " + selectedRack : "Rack " + selectedRack + " · Shelf " + selectedShelf;
    }
    function setLocationSelection(rackNumber, shelfNumber) {
        selectedRack = Number(rackNumber);
        selectedShelf = shelfNumber === null ? null : Number(shelfNumber);
        renderRacks({ keepSelection: true });
        if (locationListCard) locationListCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
    function rowImageHtml(product) {
        const info = product.image_info || {};
        const verified = !!info.preview_verified && safe(info.image_url);
        if (verified) {
            return '<img class="shelf-location-product-image" data-shelf-image="' + escapeHtml(safe(product.product_id).toUpperCase()) + '" src="' + escapeHtml(info.image_url) + '" alt="' + escapeHtml(safe(product.product_name)) + '">';
        }
        return '<div class="shelf-location-product-placeholder" data-shelf-image-placeholder="' + escapeHtml(safe(product.product_id).toUpperCase()) + '">' + escapeHtml(initials(product)) + '</div>';
    }
    function renderLocationList() {
        if (!locationProductList) return;
        const title = currentTargetLabel();
        if (locationListTitle) locationListTitle.textContent = title;
        if (locationListCopy) {
            locationListCopy.textContent = selectedShelf === null
                ? "All products assigned anywhere in this rack. Click a shelf above to attach products to a specific shelf."
                : "All products assigned to this shelf. Images are loaded from verified online sources when available.";
        }
        if (locationAttachButton) locationAttachButton.disabled = selectedShelf === null;

        const query = normalize(locationSearch && locationSearch.value);
        const products = currentScopeProducts().filter(function (product) {
            return !query || productHaystack(product).indexOf(query) >= 0;
        });
        if (!products.length) {
            locationProductList.innerHTML = '<div class="shelf-location-empty">No products are assigned to ' + escapeHtml(title) + '.</div>';
            return;
        }
        locationProductList.innerHTML = products.map(function (product) {
            const pos = positionForProduct(product.product_id);
            const positionLabel = pos ? "Rack " + pos.rack_number + " · Shelf " + pos.shelf_number : "Unassigned";
            return [
                '<article class="shelf-location-product-row" data-list-product-id="', escapeHtml(safe(product.product_id).toUpperCase()), '">',
                    rowImageHtml(product),
                    '<div><div class="shelf-location-product-name">', escapeHtml(safe(product.product_name, "Product")), '</div>',
                    '<div class="shelf-location-product-sub">', escapeHtml(safe(product.product_id)), ' · ', escapeHtml(safe(product.category, "Uncategorised")), '</div></div>',
                    '<div><div class="shelf-location-product-name">', escapeHtml(safe(product.brand, "—")), '</div>',
                    '<div class="shelf-location-product-sub">', escapeHtml(safe(product.model, "No model")), '</div></div>',
                    '<div class="shelf-location-qty">', escapeHtml(formatQuantity(product.current_quantity, product.unit)), '</div>',
                    '<div class="shelf-location-position">', escapeHtml(positionLabel), '</div>',
                    '<div class="shelf-location-row-actions">',
                        '<button type="button" data-shelf-select-product="', escapeHtml(safe(product.product_id).toUpperCase()), '">View</button>',
                        '<button type="button" data-shelf-move-product="', escapeHtml(safe(product.product_id).toUpperCase()), '">Move</button>',
                        '<button type="button" class="danger" data-shelf-remove-product="', escapeHtml(safe(product.product_id).toUpperCase()), '">Remove</button>',
                    '</div>',
                '</article>'
            ].join("");
        }).join("");
        hydrateListImages(products);
    }
    async function hydrateListImages(products) {
        for (const product of products.slice(0, 12)) {
            const id = safe(product.product_id).toUpperCase();
            if (!id || (product.image_info && product.image_info.preview_verified && safe(product.image_info.image_url)) || imageLookupCache.has(id)) continue;
            imageLookupCache.set(id, true);
            try {
                const params = new URLSearchParams({ product_name: safe(product.product_name) });
                if (safe(product.brand)) params.set("brand", safe(product.brand));
                if (safe(product.model)) params.set("model", safe(product.model));
                const info = await requestJson("/api/product-preview-image?" + params.toString());
                if (!info.preview_verified || !safe(info.image_url)) continue;
                product.image_url = info.image_url;
                product.image_info = info;
                const row = locationProductList.querySelector('[data-list-product-id="' + CSS.escape(id) + '"]');
                const placeholder = row && row.querySelector('[data-shelf-image-placeholder="' + CSS.escape(id) + '"]');
                if (placeholder) {
                    const img = document.createElement("img");
                    img.className = "shelf-location-product-image";
                    img.alt = safe(product.product_name);
                    img.src = info.image_url;
                    placeholder.replaceWith(img);
                }
            } catch (ignore) {
                // Exact/verified image is optional. Never block shelf management.
            }
        }
    }

    if (locationSearch) locationSearch.addEventListener("input", renderLocationList);

    /* ========================================================
       ATTACH / MOVE MODAL
    ======================================================== */
    function populateTargetSelectors() {
        if (!attachRackSelect || !attachShelfSelect) return;
        attachRackSelect.innerHTML = Array.from({ length: state.rack_count }, function (_, i) {
            const n = i + 1;
            return '<option value="' + n + '">Rack ' + n + '</option>';
        }).join("");
        attachShelfSelect.innerHTML = Array.from({ length: state.shelves_per_rack }, function (_, i) {
            const n = i + 1;
            return '<option value="' + n + '">Shelf ' + n + '</option>';
        }).join("");
        attachRackSelect.value = String(selectedRack || 1);
        attachShelfSelect.value = String(selectedShelf || 1);
    }
    function renderAttachList() {
        if (!attachProductList) return;
        const query = normalize(attachSearch && attachSearch.value);
        const assignments = assignmentMap();
        let products = inventory.filter(function (product) {
            const id = safe(product.product_id).toUpperCase();
            if (attachPinnedProductId && id !== attachPinnedProductId) return false;
            return !query || productHaystack(product).indexOf(query) >= 0;
        });
        products = products.slice(0, 150);
        if (!products.length) {
            attachProductList.innerHTML = '<div class="shelf-location-empty">No matching inventory products.</div>';
            return;
        }
        attachProductList.innerHTML = products.map(function (product) {
            const id = safe(product.product_id).toUpperCase();
            const current = assignments.get(id);
            const currentLabel = current ? "Rack " + current.rack_number + " · Shelf " + current.shelf_number : "Not assigned";
            return [
                '<div class="shelf-attach-product-item">',
                    '<div><strong>', escapeHtml(safe(product.product_name, "Product")), '</strong><small>', escapeHtml(id), ' · ', escapeHtml(safe(product.category, "Uncategorised")), '</small></div>',
                    '<div><strong>', escapeHtml(formatQuantity(product.current_quantity, product.unit)), '</strong><small>Current stock</small></div>',
                    '<div><strong>', escapeHtml(currentLabel), '</strong><small>Current shelf</small></div>',
                    '<button type="button" data-attach-product="', escapeHtml(id), '">', current ? 'Move Here' : 'Attach Here', '</button>',
                '</div>'
            ].join("");
        }).join("");
    }
    function openAttachModal(productId) {
        if (!attachModal) return;
        attachPinnedProductId = safe(productId).toUpperCase();
        if (!selectedRack) selectedRack = 1;
        if (!selectedShelf) selectedShelf = 1;
        populateTargetSelectors();
        if (attachSearch) attachSearch.value = "";
        if (attachTarget) attachTarget.textContent = attachPinnedProductId
            ? "Move selected product to a new shelf."
            : "Attach an inventory product without changing its stock quantity.";
        renderAttachList();
        attachModal.hidden = false;
        document.documentElement.style.overflow = "hidden";
    }
    function closeAttachModal() {
        if (!attachModal) return;
        attachModal.hidden = true;
        attachPinnedProductId = "";
        document.documentElement.style.overflow = "";
    }
    if (attachTopButton) attachTopButton.addEventListener("click", function () { openAttachModal(""); });
    if (locationAttachButton) locationAttachButton.addEventListener("click", function () { if (selectedShelf !== null) openAttachModal(""); });
    if (attachClose) attachClose.addEventListener("click", closeAttachModal);
    if (attachModal) attachModal.addEventListener("click", function (event) { if (event.target.matches("[data-shelf-modal-close]")) closeAttachModal(); });
    if (attachSearch) attachSearch.addEventListener("input", renderAttachList);

    async function attachProduct(productId) {
        const rack = Number(attachRackSelect && attachRackSelect.value || selectedRack || 1);
        const shelf = Number(attachShelfSelect && attachShelfSelect.value || selectedShelf || 1);
        setBusy(true, "Saving shelf position…");
        try {
            await requestJson("/api/shelf-rack/assign", {
                method: "POST",
                headers: { "Accept": "application/json", "Content-Type": "application/json" },
                body: JSON.stringify({ product_id: productId, rack_number: rack, shelf_number: shelf })
            });
            selectedRack = rack;
            selectedShelf = shelf;
            await reloadState();
            renderRacks({ keepSelection: true });
            closeAttachModal();
            if (footer) footer.textContent = "Shelf position saved · " + productId + " · Rack " + rack + " · Shelf " + shelf;
        } catch (error) {
            window.alert(error.message || "Unable to save shelf position.");
        } finally { setBusy(false); }
    }
    if (attachProductList) attachProductList.addEventListener("click", function (event) {
        const button = event.target.closest("[data-attach-product]");
        if (button) attachProduct(button.dataset.attachProduct);
    });

    async function removeAssignment(productId) {
        if (!window.confirm("Remove this product from the shelf? Stock quantity will NOT be deleted.")) return;
        setBusy(true, "Removing shelf position…");
        try {
            await requestJson("/api/shelf-rack/unassign", {
                method: "POST",
                headers: { "Accept": "application/json", "Content-Type": "application/json" },
                body: JSON.stringify({ product_id: productId })
            });
            if (selectedProduct && safe(selectedProduct.product_id).toUpperCase() === safe(productId).toUpperCase()) {
                selectedProduct = null;
                selectedCard = null;
                clearDetails();
            }
            await reloadState();
            renderRacks();
        } catch (error) { window.alert(error.message || "Unable to remove shelf position."); }
        finally { setBusy(false); }
    }

    if (locationProductList) locationProductList.addEventListener("click", function (event) {
        const view = event.target.closest("[data-shelf-select-product]");
        const move = event.target.closest("[data-shelf-move-product]");
        const remove = event.target.closest("[data-shelf-remove-product]");
        if (view) {
            const product = productMap.get(safe(view.dataset.shelfSelectProduct).toUpperCase());
            if (product) updateDetails(product, currentTargetLabel());
        } else if (move) {
            openAttachModal(move.dataset.shelfMoveProduct);
        } else if (remove) {
            removeAssignment(remove.dataset.shelfRemoveProduct);
        }
    });

    /* ========================================================
       CENTRAL RACK COUNT
    ======================================================== */
    async function changeRackCount(nextCount) {
        setBusy(true, "Updating rack layout…");
        try {
            await requestJson("/api/shelf-rack/layout", {
                method: "POST",
                headers: { "Accept": "application/json", "Content-Type": "application/json" },
                body: JSON.stringify({ rack_count: nextCount })
            });
            await reloadState();
            renderRacks({ keepSelection: true });
        } catch (error) { window.alert(error.message || "Unable to update rack layout."); }
        finally { setBusy(false); }
    }
    if (addRackButton) addRackButton.addEventListener("click", function () { if (state.rack_count < 12) changeRackCount(state.rack_count + 1); });
    if (removeRackButton) removeRackButton.addEventListener("click", function () { if (state.rack_count > 1) changeRackCount(state.rack_count - 1); });

    /* ========================================================
       PRODUCT DETAILS + VERIFIED ONLINE IMAGE
    ======================================================== */
    function clearDetails() {
        if (detailName) detailName.value = "";
        if (detailMeta) detailMeta.textContent = "Click a product to edit it.";
        if (detailId) detailId.value = "";
        if (detailStock) detailStock.value = "0";
        if (detailCategory) detailCategory.value = "";
        if (detailPosition) detailPosition.value = "";
        if (detailBrand) detailBrand.value = "";
        if (detailModel) detailModel.value = "";
        if (detailLocation) detailLocation.value = "";
        if (detailUnit) detailUnit.value = "Nos";
        if (saveProductButton) saveProductButton.disabled = true;
        if (retryImageButton) retryImageButton.disabled = true;
        if (addButton) addButton.disabled = true;
        if (removeButton) removeButton.disabled = true;
        showPreviewEmpty("Select a product to load its verified image.");
    }
    function showPreviewEmpty(message) {
        if (previewImage) { previewImage.hidden = true; previewImage.removeAttribute("src"); previewImage.alt = ""; }
        if (previewEmpty) { previewEmpty.hidden = false; previewEmpty.textContent = message || "No verified product image."; }
        if (previewSource) { previewSource.hidden = true; previewSource.removeAttribute("href"); }
    }
    function showVerifiedPreview(product, info, statusText) {
        if (!previewImage || !safe(info && info.image_url)) return false;
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
        previewImage.src = info.image_url;
        if (previewStatus) previewStatus.textContent = statusText || "Verified product image";
        if (previewSource && safe(info.product_url)) { previewSource.href = info.product_url; previewSource.hidden = false; }
        return true;
    }
    async function updateProductPreview(product, forceSearch) {
        if (!product) return;
        const requestToken = ++previewRequestToken;
        const cached = product.image_info || {};
        if (!forceSearch && cached.preview_verified && safe(cached.image_url)) {
            showVerifiedPreview(product, cached, "Verified cached product image");
            return;
        }
        showPreviewEmpty("Searching for the exact product image…");
        if (previewStatus) previewStatus.textContent = "Checking verified online source…";
        const params = new URLSearchParams({ product_name: safe(product.product_name) });
        if (safe(product.brand)) params.set("brand", safe(product.brand));
        if (safe(product.model)) params.set("model", safe(product.model));
        if (forceSearch) params.set("force", "1");
        try {
            const info = await requestJson("/api/product-preview-image?" + params.toString());
            if (requestToken !== previewRequestToken) return;
            if (info.preview_verified && safe(info.image_url)) {
                product.image_url = info.image_url;
                product.image_info = info;
                showVerifiedPreview(product, info, "Verified online product image");
            } else {
                showPreviewEmpty("No verified product image found. A guessed image was not used.");
                if (previewStatus) previewStatus.textContent = "No verified image";
            }
        } catch (error) {
            if (requestToken !== previewRequestToken) return;
            showPreviewEmpty("Could not verify an online product image right now.");
            if (previewStatus) previewStatus.textContent = "Image verification unavailable";
        }
    }
    function updateDetails(product, positionLabel) {
        selectedProduct = product;
        if (detailName) detailName.value = safe(product.product_name, "Product");
        if (detailMeta) detailMeta.textContent = "Edit normal product fields below; shelf position is changed with Move.";
        if (detailId) detailId.value = safe(product.product_id);
        if (detailStock) detailStock.value = String(numberValue(product.current_quantity));
        if (detailCategory) detailCategory.value = safe(product.category);
        const pos = positionForProduct(product.product_id);
        if (detailPosition) detailPosition.value = pos ? "Rack " + pos.rack_number + " · Shelf " + pos.shelf_number : safe(positionLabel, "Unassigned");
        if (detailBrand) detailBrand.value = safe(product.brand);
        if (detailModel) detailModel.value = safe(product.model);
        if (detailLocation) detailLocation.value = safe(product.location, "");
        if (detailUnit) detailUnit.value = safe(product.unit, "Nos");
        if (saveProductButton) saveProductButton.disabled = false;
        if (saveProductStatus) saveProductStatus.textContent = "Ready to edit.";
        if (retryImageButton) retryImageButton.disabled = false;
        if (addButton) addButton.disabled = false;
        if (removeButton) removeButton.disabled = numberValue(product.current_quantity) <= 0;
        updateProductPreview(product, false);
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
            const result = await requestJson("/api/product/" + encodeURIComponent(oldId) + "/edit", {
                method: "PUT",
                headers: { "Accept": "application/json", "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
            const oldKey = safe(selectedProduct.product_id).toUpperCase();
            Object.assign(selectedProduct, result.product || payload);
            const newKey = safe(selectedProduct.product_id).toUpperCase();
            if (oldKey !== newKey) { productMap.delete(oldKey); productMap.set(newKey, selectedProduct); }
            if (saveProductStatus) saveProductStatus.textContent = "Saved.";
            await reloadState();
            renderRacks({ keepSelection: true });
        } catch (error) {
            if (saveProductStatus) saveProductStatus.textContent = error.message || "Save failed.";
            window.alert(error.message || "Unable to save product changes.");
        } finally { saveProductButton.disabled = !selectedProduct; setBusy(false); }
    }
    if (saveProductButton) saveProductButton.addEventListener("click", saveSelectedProduct);
    if (retryImageButton) retryImageButton.addEventListener("click", function () { if (selectedProduct) updateProductPreview(selectedProduct, true); });

    function selectProductCard(card) {
        if (!card) return;
        const id = safe(card.dataset.productId).toUpperCase();
        const product = productMap.get(id);
        if (!product) return;
        if (selectedCard) selectedCard.classList.remove("selected");
        selectedCard = card;
        selectedCard.classList.add("selected");
        updateDetails(product, card.dataset.rackPosition || "-");
    }

    world.addEventListener("click", function (event) {
        const card = event.target.closest(".fast-rack-product");
        if (card && world.contains(card)) {
            event.stopPropagation();
            selectProductCard(card);
            return;
        }
        const shelf = event.target.closest(".fast-rack-shelf");
        if (shelf && world.contains(shelf)) {
            setLocationSelection(Number(shelf.dataset.rack), Number(shelf.dataset.shelf));
            return;
        }
        const header = event.target.closest("[data-rack-header]");
        if (header && world.contains(header)) {
            setLocationSelection(Number(header.dataset.rackHeader), null);
        }
    });

    /* ========================================================
       QUICK +1 / -1 STOCK — INVENTORY CHANGE, NOT PLACEMENT
    ======================================================== */
    async function moveOne(movementType) {
        if (!selectedProduct) return;
        if (movementType === "outward" && numberValue(selectedProduct.current_quantity) <= 0) return;
        setBusy(true, movementType === "inward" ? "Adding one unit…" : "Removing one unit…");
        try {
            const payload = await requestJson("/stock-movement", {
                method: "POST",
                headers: { "Accept": "application/json", "Content-Type": "application/json" },
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
                    remarks: "Quick shelf rack stock adjustment"
                })
            });
            const result = payload.result || {};
            selectedProduct.current_quantity = result.new_quantity !== undefined
                ? numberValue(result.new_quantity)
                : Math.max(0, numberValue(selectedProduct.current_quantity) + (movementType === "inward" ? 1 : -1));
            if (detailStock) detailStock.value = String(selectedProduct.current_quantity);
            renderRacks({ keepSelection: true });
        } catch (error) { window.alert(error.message || "Unable to update stock."); }
        finally { setBusy(false); }
    }
    if (addButton) addButton.addEventListener("click", function () { moveOne("inward"); });
    if (removeButton) removeButton.addEventListener("click", function () { moveOne("outward"); });

    /* ========================================================
       EXISTING EXCEL ENTRY POINT
    ======================================================== */
    if (fileInput) fileInput.addEventListener("change", function () {
        if (!fileInput.files || !fileInput.files[0]) return;
        window.location.href = "/import-excel";
    });

    /* ========================================================
       LIGHTWEIGHT 3D INTERACTION — SAME BEHAVIOUR
    ======================================================== */
    let yaw = -2, pitch = 2, zoom = 1, panX = 0, panY = 0;
    let dragging = false, dragMode = "rotate", lastX = 0, lastY = 0;
    function applyWorldTransform() {
        world.style.transform = "translate3d(" + panX + "px," + panY + "px,0) rotateX(" + pitch + "deg) rotateY(" + yaw + "deg) scale(" + zoom + ")";
    }
    applyWorldTransform();
    viewport.addEventListener("contextmenu", function (event) { event.preventDefault(); });
    viewport.addEventListener("pointerdown", function (event) {
        const rightButton = event.button === 2;
        if (event.target.closest(".fast-rack-product") && !rightButton) return;
        if (event.target.closest(".fast-rack-shelf") && !rightButton) return;
        dragging = true;
        dragMode = rightButton ? "pan" : "rotate";
        lastX = event.clientX; lastY = event.clientY;
        viewport.classList.toggle("panning", dragMode === "pan");
        viewport.classList.toggle("dragging", dragMode === "rotate");
        if (viewport.setPointerCapture) viewport.setPointerCapture(event.pointerId);
        event.preventDefault();
    });
    viewport.addEventListener("pointermove", function (event) {
        if (!dragging) return;
        const dx = event.clientX - lastX, dy = event.clientY - lastY;
        if (dragMode === "pan") { panX += dx; panY += dy; }
        else { yaw = Math.max(-13, Math.min(13, yaw + dx * .035)); pitch = Math.max(-4, Math.min(10, pitch - dy * .025)); }
        lastX = event.clientX; lastY = event.clientY; applyWorldTransform();
    });
    function stopDragging() { dragging = false; viewport.classList.remove("dragging"); viewport.classList.remove("panning"); }
    viewport.addEventListener("pointerup", stopDragging);
    viewport.addEventListener("pointercancel", stopDragging);
    viewport.addEventListener("pointerleave", function (event) { if (dragging && event.buttons === 0) stopDragging(); });
    viewport.addEventListener("wheel", function (event) { if (event.ctrlKey) return; event.preventDefault(); zoom = Math.max(.68, Math.min(1.35, zoom - event.deltaY * .0006)); applyWorldTransform(); }, { passive: false });
    viewport.addEventListener("dblclick", function (event) {
        if (event.target.closest(".fast-rack-product")) return;
        yaw = -2; pitch = 2; zoom = 1; panX = 0; panY = 0; applyWorldTransform();
    });

    // Initial shared state view.
    renderRacks();
    clearDetails();

    window.ShelfRack3D = {
        showShelfRack: showShelfRack,
        showOpenRack: showOpenRack,
        products: inventory,
        refresh: async function () { await reloadState(); renderRacks({ keepSelection: true }); },
        addRack: function () { if (addRackButton) addRackButton.click(); }
    };
})();

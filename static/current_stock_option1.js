(function () {
    "use strict";

    const root = document.querySelector("[data-current-stock-option1]");
    if (!root) return;

    const search = document.getElementById("cs1Search");
    const categoryFilter = document.getElementById("cs1CategoryFilter");
    const statusFilter = document.getElementById("cs1StatusFilter");
    const locationFilter = document.getElementById("cs1LocationFilter");
    const tbody = document.getElementById("cs1Rows");
    const allRows = Array.from(tbody ? tbody.querySelectorAll("tr.cs1-row") : []);
    const pageButtons = document.getElementById("cs1PageButtons");
    const prevButton = document.getElementById("cs1Prev");
    const nextButton = document.getElementById("cs1Next");
    const pageStatus = document.getElementById("cs1PageStatus");
    const pageSizeSelect = document.getElementById("cs1PageSize");
    const emptyState = document.getElementById("cs1Empty");

    let currentPage = 1;
    let sortKey = "name";
    let sortDirection = "asc";

    function normalize(value) {
        return String(value || "").trim().toLowerCase();
    }

    function numberValue(value) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : 0;
    }

    function labelCase(value) {
        return String(value || "").replace(/\b\w/g, ch => ch.toUpperCase());
    }

    function populateSelect(select, values) {
        if (!select) return;
        Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b)).forEach(value => {
            const option = document.createElement("option");
            option.value = value;
            option.textContent = labelCase(value);
            select.appendChild(option);
        });
    }

    populateSelect(categoryFilter, allRows.map(row => row.dataset.category));
    populateSelect(locationFilter, allRows.map(row => row.dataset.location));

    function filteredRows() {
        const query = normalize(search && search.value);
        const category = normalize(categoryFilter && categoryFilter.value);
        const status = normalize(statusFilter && statusFilter.value);
        const location = normalize(locationFilter && locationFilter.value);
        return allRows.filter(row => {
            const haystack = [row.dataset.name,row.dataset.productId,row.dataset.category,row.dataset.brand,row.dataset.model,row.dataset.location].join(" ");
            return (!query || haystack.includes(query)) &&
                (!category || row.dataset.category === category) &&
                (!status || row.dataset.status === status) &&
                (!location || row.dataset.location === location);
        });
    }

    function comparable(row, key) {
        if (key === "qty") return numberValue(row.dataset.qty);
        if (key === "updated") return String(row.dataset.updated || "");
        if (key === "productId") return String(row.dataset.productId || "");
        if (key === "category") return String(row.dataset.category || "");
        if (key === "brandModel") return String(row.dataset.brandModel || "");
        if (key === "location") return String(row.dataset.location || "");
        if (key === "status") return String(row.dataset.status || "");
        return String(row.dataset.name || "");
    }

    function sortedRows(rows) {
        return rows.slice().sort((a, b) => {
            const av = comparable(a, sortKey);
            const bv = comparable(b, sortKey);
            const cmp = typeof av === "number" ? av - bv : String(av).localeCompare(String(bv));
            return sortDirection === "asc" ? cmp : -cmp;
        });
    }

    function pageSize() {
        return Math.max(1, Number(pageSizeSelect && pageSizeSelect.value) || 8);
    }

    function renderPageButtons(totalPages) {
        if (!pageButtons) return;
        pageButtons.innerHTML = "";
        const visible = 5;
        let start = Math.max(1, currentPage - 2);
        let end = Math.min(totalPages, start + visible - 1);
        start = Math.max(1, end - visible + 1);
        for (let page = start; page <= end; page += 1) {
            const button = document.createElement("button");
            button.type = "button";
            button.textContent = String(page);
            button.classList.toggle("active", page === currentPage);
            button.addEventListener("click", () => { currentPage = page; render(); });
            pageButtons.appendChild(button);
        }
        if (totalPages > visible && end < totalPages) {
            const dots = document.createElement("span");
            dots.textContent = "…";
            dots.style.padding = "0 4px";
            pageButtons.appendChild(dots);
            const last = document.createElement("button");
            last.type = "button";
            last.textContent = String(totalPages);
            last.addEventListener("click", () => { currentPage = totalPages; render(); });
            pageButtons.appendChild(last);
        }
    }

    function render() {
        const rows = sortedRows(filteredRows());
        const size = pageSize();
        const totalPages = Math.max(1, Math.ceil(rows.length / size));
        if (currentPage > totalPages) currentPage = totalPages;
        allRows.forEach(row => { row.hidden = true; });
        const start = (currentPage - 1) * size;
        const pageRows = rows.slice(start, start + size);
        pageRows.forEach(row => { row.hidden = false; if (tbody) tbody.appendChild(row); });
        renderPageButtons(totalPages);
        if (prevButton) prevButton.disabled = currentPage <= 1;
        if (nextButton) nextButton.disabled = currentPage >= totalPages;
        if (emptyState) emptyState.hidden = rows.length !== 0;
        if (pageStatus) {
            const first = rows.length ? start + 1 : 0;
            const last = Math.min(start + size, rows.length);
            pageStatus.textContent = rows.length ? `Showing ${first} to ${last} of ${rows.length} products` : "No matching products";
        }
    }

    [search, categoryFilter, statusFilter, locationFilter].forEach(control => {
        if (!control) return;
        control.addEventListener(control === search ? "input" : "change", () => { currentPage = 1; render(); });
    });
    if (pageSizeSelect) pageSizeSelect.addEventListener("change", () => { currentPage = 1; render(); });
    if (prevButton) prevButton.addEventListener("click", () => { if (currentPage > 1) { currentPage -= 1; render(); } });
    if (nextButton) nextButton.addEventListener("click", () => { currentPage += 1; render(); });

    document.querySelectorAll("#cs1StockTable th[data-sort-key]").forEach(header => {
        header.addEventListener("click", () => {
            const nextKey = header.dataset.sortKey;
            if (sortKey === nextKey) sortDirection = sortDirection === "asc" ? "desc" : "asc";
            else { sortKey = nextKey; sortDirection = "asc"; }
            currentPage = 1;
            render();
        });
    });

    document.addEventListener("click", event => {
        const more = event.target.closest("[data-more-actions]");
        document.querySelectorAll(".cs1-row-menu").forEach(menu => {
            if (!more || menu !== more.nextElementSibling) menu.hidden = true;
        });
        if (more) {
            const menu = more.nextElementSibling;
            if (menu) menu.hidden = !menu.hidden;
            event.stopPropagation();
        }
    });

    const drawerBackdrop = document.getElementById("cs1ProductDrawer");
    const drawerClose = document.getElementById("cs1DrawerClose");
    const archiveButton = document.getElementById("cs1ArchiveProduct");
    const drawerImage = document.getElementById("cs1DrawerImage");
    const drawerFallback = document.getElementById("cs1DrawerFallback");
    let selectedProductId = "";
    let selectedProductActive = true;

    function setText(id, value) { const el = document.getElementById(id); if (el) el.textContent = value || "—"; }
    function openDrawer(button) {
        if (!drawerBackdrop || !button) return;
        const d = button.dataset;
        const qty = numberValue(d.productQuantity);
        selectedProductId = d.productId || "";
        selectedProductActive = d.productActive !== "0";
        setText("cs1DrawerTitle", d.productName);
        setText("cs1DrawerMeta", [d.productBrand,d.productModel].filter(Boolean).join(" · ") || "Brand / model not assigned");
        setText("cs1DrawerQty", `${d.productQuantity || 0} ${d.productUnit || "Nos"}`);
        setText("cs1DrawerStatus", selectedProductActive ? (qty > 0 ? "Active stock" : "No stock available") : "Archived · history preserved");
        setText("cs1DrawerId", d.productId);
        setText("cs1DrawerCategory", d.productCategory);
        setText("cs1DrawerRack", d.productRackMapped === "1" ? "Rack mapped" : "Inventory only");
        setText("cs1DrawerLocation", d.productLocation || "Not assigned");
        setText("cs1DrawerBrandModel", [d.productBrand,d.productModel].filter(Boolean).join(" / ") || "Not assigned");
        if (drawerImage && drawerFallback) {
            if (d.productImage) { drawerImage.src = d.productImage; drawerImage.hidden = false; drawerFallback.hidden = true; drawerImage.onerror = () => { drawerImage.hidden = true; drawerFallback.hidden = false; }; }
            else { drawerImage.hidden = true; drawerFallback.hidden = false; }
        }
        if (archiveButton) archiveButton.textContent = selectedProductActive ? "Archive Product" : "Restore Product";
        drawerBackdrop.hidden = false;
        document.body.style.overflow = "hidden";
    }
    function closeDrawer() { if (!drawerBackdrop) return; drawerBackdrop.hidden = true; document.body.style.overflow = ""; }
    document.querySelectorAll("[data-open-product-details]").forEach(button => button.addEventListener("click", () => openDrawer(button)));
    if (drawerClose) drawerClose.addEventListener("click", closeDrawer);
    if (drawerBackdrop) drawerBackdrop.addEventListener("click", event => { if (event.target === drawerBackdrop) closeDrawer(); });
    document.addEventListener("keydown", event => { if (event.key === "Escape") closeDrawer(); });

    async function changeArchiveState(productId, active, button) {
        const action = active ? "archive" : "restore";
        const message = active ? `Archive ${productId}?\n\nStock history will be preserved.` : `Restore ${productId} to active stock?`;
        if (!window.confirm(message)) return;
        let reason = "";
        if (active) reason = window.prompt("Optional reason for archiving:", "") || "";
        if (button) button.disabled = true;
        try {
            const response = await fetch(`/api/product/${encodeURIComponent(productId)}/${action}`, {
                method:"POST", headers:{"Content-Type":"application/json","Accept":"application/json"}, body:JSON.stringify({reason})
            });
            const data = await response.json();
            if (!response.ok || !data.success) throw new Error(data.message || "Unable to update product status.");
            window.location.reload();
        } catch (error) {
            window.alert(error.message || "Unable to update product status.");
            if (button) button.disabled = false;
        }
    }

    if (archiveButton) archiveButton.addEventListener("click", () => changeArchiveState(selectedProductId, selectedProductActive, archiveButton));
    document.querySelectorAll("[data-row-archive]").forEach(button => {
        button.addEventListener("click", () => changeArchiveState(button.dataset.productId || "", button.dataset.active !== "0", button));
    });

    render();
})();

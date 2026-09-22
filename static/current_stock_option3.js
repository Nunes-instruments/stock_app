(function () {
    "use strict";

    const root = document.querySelector("[data-current-stock-option3]");
    if (!root) return;

    const search = document.getElementById("cs3Search");
    const categoryFilter = document.getElementById("cs3CategoryFilter");
    const statusButtons = Array.from(document.querySelectorAll("[data-status-filter]"));
    const sortSelect = document.getElementById("cs3Sort");
    const tbody = document.getElementById("cs3Rows");
    const rows = Array.from(tbody ? tbody.querySelectorAll("tr.cs3-row") : []);
    const pageButtons = document.getElementById("cs3PageButtons");
    const prevButton = document.getElementById("cs3Prev");
    const nextButton = document.getElementById("cs3Next");
    const pageStatus = document.getElementById("cs3PageStatus");
    const resultLabel = document.getElementById("cs3ResultLabel");
    const selectAll = document.getElementById("cs3SelectAll");
    const branchChange = document.getElementById("cs3BranchChange");
    const branchList = document.getElementById("cs3BranchList");

    let activeStatus = "all";
    let currentPage = 1;
    const pageSize = 8;

    function normalize(value) {
        return String(value || "").trim().toLowerCase();
    }

    function numberValue(value) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : 0;
    }

    function buildCategoryOptions() {
        if (!categoryFilter) return;
        const categories = Array.from(new Set(rows.map(row => row.dataset.category).filter(Boolean)))
            .sort((a, b) => a.localeCompare(b));
        categories.forEach(category => {
            const option = document.createElement("option");
            option.value = category;
            option.textContent = category.replace(/\b\w/g, ch => ch.toUpperCase());
            categoryFilter.appendChild(option);
        });
    }

    function filteredRows() {
        const query = normalize(search && search.value);
        const category = normalize(categoryFilter && categoryFilter.value);
        return rows.filter(row => {
            const haystack = [
                row.dataset.name,
                row.dataset.productId,
                row.dataset.category,
                row.dataset.brand,
                row.dataset.model,
                row.dataset.location
            ].join(" ");
            const matchesSearch = !query || haystack.includes(query);
            const matchesCategory = !category || row.dataset.category === category;
            const matchesStatus = activeStatus === "all" || row.dataset.status === activeStatus;
            return matchesSearch && matchesCategory && matchesStatus;
        });
    }

    function sortRows(list) {
        const mode = sortSelect ? sortSelect.value : "name-asc";
        return list.slice().sort((a, b) => {
            if (mode === "qty-desc") return numberValue(b.dataset.qty) - numberValue(a.dataset.qty);
            if (mode === "qty-asc") return numberValue(a.dataset.qty) - numberValue(b.dataset.qty);
            if (mode === "updated-desc") return String(b.dataset.updated || "").localeCompare(String(a.dataset.updated || ""));
            return String(a.dataset.name || "").localeCompare(String(b.dataset.name || ""));
        });
    }

    function renderPagination(total) {
        if (!pageButtons) return;
        const pages = Math.max(1, Math.ceil(total / pageSize));
        if (currentPage > pages) currentPage = pages;
        pageButtons.innerHTML = "";

        const maxButtons = 5;
        let start = Math.max(1, currentPage - 2);
        let end = Math.min(pages, start + maxButtons - 1);
        start = Math.max(1, end - maxButtons + 1);

        for (let page = start; page <= end; page += 1) {
            const button = document.createElement("button");
            button.type = "button";
            button.textContent = String(page);
            button.classList.toggle("active", page === currentPage);
            button.addEventListener("click", () => {
                currentPage = page;
                applyFilters();
            });
            pageButtons.appendChild(button);
        }

        if (prevButton) prevButton.disabled = currentPage <= 1;
        if (nextButton) nextButton.disabled = currentPage >= pages;
    }

    function applyFilters() {
        const filtered = sortRows(filteredRows());
        rows.forEach(row => { row.hidden = true; });

        const start = (currentPage - 1) * pageSize;
        const visible = filtered.slice(start, start + pageSize);
        visible.forEach(row => {
            row.hidden = false;
            if (tbody) tbody.appendChild(row);
        });

        renderPagination(filtered.length);

        const first = filtered.length ? start + 1 : 0;
        const last = Math.min(start + pageSize, filtered.length);
        if (pageStatus) pageStatus.textContent = filtered.length ? `Showing ${first} to ${last} of ${filtered.length} products` : "No matching products";
        if (resultLabel) resultLabel.textContent = filtered.length ? `${filtered.length} matching product${filtered.length === 1 ? "" : "s"}` : "No matching products";
        if (selectAll) selectAll.checked = false;
    }

    if (search) search.addEventListener("input", () => { currentPage = 1; applyFilters(); });
    if (categoryFilter) categoryFilter.addEventListener("change", () => { currentPage = 1; applyFilters(); });
    if (sortSelect) sortSelect.addEventListener("change", () => { currentPage = 1; applyFilters(); });

    statusButtons.forEach(button => {
        button.addEventListener("click", () => {
            activeStatus = button.dataset.statusFilter || "all";
            statusButtons.forEach(item => item.classList.toggle("active", item === button));
            currentPage = 1;
            applyFilters();
        });
    });

    if (prevButton) prevButton.addEventListener("click", () => {
        if (currentPage > 1) { currentPage -= 1; applyFilters(); }
    });
    if (nextButton) nextButton.addEventListener("click", () => {
        const pages = Math.max(1, Math.ceil(filteredRows().length / pageSize));
        if (currentPage < pages) { currentPage += 1; applyFilters(); }
    });

    if (selectAll) {
        selectAll.addEventListener("change", () => {
            rows.filter(row => !row.hidden).forEach(row => {
                const checkbox = row.querySelector(".cs3-row-check");
                if (checkbox) checkbox.checked = selectAll.checked;
            });
        });
    }

    if (branchChange && branchList) {
        branchChange.addEventListener("click", () => {
            branchList.scrollIntoView({ behavior: "smooth", block: "center" });
            branchList.animate(
                [{ transform: "scale(1)" }, { transform: "scale(1.025)" }, { transform: "scale(1)" }],
                { duration: 420 }
            );
        });
    }

    // Product details drawer keeps the existing stock workflow and archive API.
    const drawerBackdrop = document.getElementById("cs3ProductDrawer");
    const drawerClose = document.getElementById("cs3DrawerClose");
    const archiveButton = document.getElementById("cs3ArchiveProduct");
    const drawerImage = document.getElementById("cs3DrawerImage");
    const drawerFallback = document.getElementById("cs3DrawerFallback");
    let selectedProductId = "";
    let selectedProductActive = true;

    function setText(id, value) {
        const element = document.getElementById(id);
        if (element) element.textContent = value || "—";
    }

    function openDrawer(button) {
        if (!drawerBackdrop || !button) return;
        const d = button.dataset;
        const qty = numberValue(d.productQuantity);
        const unit = d.productUnit || "Nos";
        selectedProductId = d.productId || "";
        selectedProductActive = d.productActive !== "0";

        setText("cs3DrawerTitle", d.productName);
        setText("cs3DrawerMeta", [d.productBrand, d.productModel].filter(Boolean).join(" · ") || "Brand / model not assigned");
        setText("cs3DrawerQty", `${d.productQuantity || 0} ${unit}`);
        setText("cs3DrawerStatus", selectedProductActive ? (qty > 0 ? "Active stock" : "No stock available") : "Archived · history preserved");
        setText("cs3DrawerId", d.productId);
        setText("cs3DrawerCategory", d.productCategory);
        setText("cs3DrawerRack", d.productRackMapped === "1" ? "Rack mapped" : "Inventory only");
        setText("cs3DrawerLocation", d.productLocation || "Not assigned");
        setText("cs3DrawerBrandModel", [d.productBrand, d.productModel].filter(Boolean).join(" / ") || "Not assigned");

        if (drawerImage && drawerFallback) {
            if (d.productImage) {
                drawerImage.src = d.productImage;
                drawerImage.hidden = false;
                drawerFallback.hidden = true;
                drawerImage.onerror = function () {
                    drawerImage.hidden = true;
                    drawerFallback.hidden = false;
                };
            } else {
                drawerImage.hidden = true;
                drawerFallback.hidden = false;
            }
        }

        if (archiveButton) {
            archiveButton.textContent = selectedProductActive ? "Archive Product" : "Restore Product";
        }

        drawerBackdrop.hidden = false;
        document.body.style.overflow = "hidden";
    }

    function closeDrawer() {
        if (!drawerBackdrop) return;
        drawerBackdrop.hidden = true;
        document.body.style.overflow = "";
    }

    document.querySelectorAll("[data-open-product-details]").forEach(button => {
        button.addEventListener("click", () => openDrawer(button));
    });
    if (drawerClose) drawerClose.addEventListener("click", closeDrawer);
    if (drawerBackdrop) drawerBackdrop.addEventListener("click", event => {
        if (event.target === drawerBackdrop) closeDrawer();
    });
    document.addEventListener("keydown", event => {
        if (event.key === "Escape") closeDrawer();
    });

    if (archiveButton) {
        archiveButton.addEventListener("click", async () => {
            if (!selectedProductId) return;
            const action = selectedProductActive ? "archive" : "restore";
            const message = selectedProductActive
                ? `Archive ${selectedProductId}?\n\nStock history will be preserved.`
                : `Restore ${selectedProductId} to active stock?`;
            if (!window.confirm(message)) return;

            let reason = "";
            if (selectedProductActive) reason = window.prompt("Optional reason for archiving:", "") || "";
            archiveButton.disabled = true;
            try {
                const response = await fetch(`/api/product/${encodeURIComponent(selectedProductId)}/${action}`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "Accept": "application/json" },
                    body: JSON.stringify({ reason })
                });
                const data = await response.json();
                if (!response.ok || !data.success) throw new Error(data.message || "Unable to update product status.");
                window.location.reload();
            } catch (error) {
                window.alert(error.message || "Unable to update product status.");
                archiveButton.disabled = false;
            }
        });
    }

    buildCategoryOptions();
    applyFilters();
})();

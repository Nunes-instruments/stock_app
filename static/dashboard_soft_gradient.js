/**
 * NUNES Stock v3.2.12 — Executive Dashboard Intelligence & Interactions
 * Features:
 * - Real-time clock & greeting
 * - Chart.js Category Distribution Donut
 * - Chart.js 7-Day Inward vs Outward Movement Dynamics
 * - Global Instant Product Search with Dropdown Autocomplete (Ctrl+K)
 * - Quick Stock Movement Modal (Direct Inward/Outward AJAX)
 * - Recent Movement Ledger Filter Tabs
 * - 1-Click CSV Summary Export
 */
(function () {
    "use strict";

    // ==========================================
    // 1. CLOCK & GREETING
    // ==========================================
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
    setInterval(tick, 30000);

    // ==========================================
    // 2. VISUAL CHARTS (Chart.js)
    // ==========================================
    const data = window.DASH_DATA || {};

    const PALETTE = [
        "#1976ea", // Deep Blue
        "#0c9b63", // Emerald Green
        "#7659f4", // Vibrant Violet
        "#f59e0b", // Warm Amber
        "#06b6d4", // Electric Cyan
        "#ec4899", // Rose Pink
        "#8b5cf6", // Purple
        "#10b981", // Mint
    ];

    // Chart A: Category Donut
    const catCanvas = document.getElementById("categoryDonutChart");
    if (catCanvas && window.Chart && data.categoryLabels && data.categoryLabels.length) {
        const catChart = new Chart(catCanvas, {
            type: "doughnut",
            data: {
                labels: data.categoryLabels,
                datasets: [{
                    data: data.categoryQuantities,
                    backgroundColor: PALETTE.slice(0, data.categoryLabels.length),
                    borderWidth: 2,
                    borderColor: "#ffffff",
                    hoverOffset: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: "68%",
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: "rgba(17, 43, 76, 0.94)",
                        titleFont: { size: 13, weight: "bold" },
                        bodyFont: { size: 12 },
                        padding: 10,
                        cornerRadius: 8,
                        callbacks: {
                            label: function (ctx) {
                                const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                                const val = ctx.raw || 0;
                                const pct = total > 0 ? Math.round((val / total) * 100) : 0;
                                return ` ${val} Units (${pct}%)`;
                            }
                        }
                    }
                }
            }
        });

        // Custom HTML Legend
        const legendContainer = document.getElementById("categoryLegend");
        if (legendContainer) {
            legendContainer.innerHTML = data.categoryLabels.map((label, idx) => {
                const color = PALETTE[idx % PALETTE.length];
                const qty = data.categoryQuantities[idx] || 0;
                return `
                    <div class="sg-legend-item" title="${label}">
                        <span class="sg-legend-color" style="background: ${color}"></span>
                        <span class="sg-legend-text">${label}</span>
                        <strong>${qty}</strong>
                    </div>
                `;
            }).join("");
        }
    }

    // Chart B: Movement Dynamics Bar Chart
    const moveCanvas = document.getElementById("movementTrendChart");
    if (moveCanvas && window.Chart && data.trendLabels && data.trendLabels.length) {
        new Chart(moveCanvas, {
            type: "bar",
            data: {
                labels: data.trendLabels,
                datasets: [
                    {
                        label: "Inward (+)",
                        data: data.trendInward,
                        backgroundColor: "#0c9b63",
                        borderRadius: 6,
                        maxBarThickness: 28
                    },
                    {
                        label: "Outward (−)",
                        data: data.trendOutward,
                        backgroundColor: "#e84255",
                        borderRadius: 6,
                        maxBarThickness: 28
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: "rgba(17, 43, 76, 0.94)",
                        padding: 10,
                        cornerRadius: 8
                    }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: {
                            color: "#7086a0",
                            font: { size: 11 }
                        }
                    },
                    y: {
                        beginAtZero: true,
                        grid: { color: "rgba(220, 233, 246, 0.6)" },
                        ticks: {
                            color: "#7086a0",
                            font: { size: 11 },
                            precision: 0
                        }
                    }
                }
            }
        });
    }

    // ==========================================
    // 3. GLOBAL INSTANT SEARCH (Ctrl+K)
    // ==========================================
    const searchInput = document.getElementById("dash-search-input");
    const searchResults = document.getElementById("dash-search-results");
    const products = data.products || [];

    if (searchInput && searchResults) {
        searchInput.addEventListener("input", function () {
            const query = (this.value || "").trim().toLowerCase();
            if (!query) {
                searchResults.style.display = "none";
                searchResults.innerHTML = "";
                return;
            }

            const matches = products.filter(p =>
                (p.product_name && p.product_name.toLowerCase().includes(query)) ||
                (p.product_id && p.product_id.toLowerCase().includes(query)) ||
                (p.category && p.category.toLowerCase().includes(query))
            ).slice(0, 8);

            if (!matches.length) {
                searchResults.innerHTML = `<div class="sg-search-empty">No instruments found matching "<strong>${escapeHtml(query)}</strong>"</div>`;
                searchResults.style.display = "block";
                return;
            }

            searchResults.innerHTML = matches.map(p => `
                <div class="sg-search-item" onclick="selectSearchProduct('${escapeHtml(p.product_id)}')">
                    <div class="sg-si-info">
                        <span class="sg-si-code">${escapeHtml(p.product_id)}</span>
                        <strong>${escapeHtml(p.product_name)}</strong>
                        <small>${escapeHtml(p.category || 'General')} ${p.location ? '· ' + escapeHtml(p.location) : ''}</small>
                    </div>
                    <div class="sg-si-actions">
                        <span class="sg-si-qty ${p.current_quantity <= 2 ? 'low' : ''}">${p.current_quantity} ${escapeHtml(p.unit || 'Nos')}</span>
                        <button type="button" class="sg-btn-sm" onclick="event.stopPropagation(); openQuickMoveModal('inward', '${escapeHtml(p.product_id)}')">+ In</button>
                        <button type="button" class="sg-btn-sm danger" onclick="event.stopPropagation(); openQuickMoveModal('outward', '${escapeHtml(p.product_id)}')">− Out</button>
                    </div>
                </div>
            `).join("");
            searchResults.style.display = "block";
        });

        // Close dropdown when clicking outside
        document.addEventListener("click", function (e) {
            if (!searchInput.contains(e.target) && !searchResults.contains(e.target)) {
                searchResults.style.display = "none";
            }
        });

        // Shortcut Ctrl+K / Cmd+K
        document.addEventListener("keydown", function (e) {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
                e.preventDefault();
                searchInput.focus();
                searchInput.select();
            }
        });
    }

    // ==========================================
    // 4. RECENT ACTIVITY LEDGER TABS
    // ==========================================
    const tabs = document.querySelectorAll(".sg-tab");
    const table = document.getElementById("recentMovesTable");
    if (tabs.length && table) {
        tabs.forEach(tab => {
            tab.addEventListener("click", function () {
                tabs.forEach(t => t.classList.remove("active"));
                this.classList.add("active");
                const filter = this.getAttribute("data-filter");
                const rows = table.querySelectorAll("tbody tr");
                rows.forEach(r => {
                    const rowType = r.getAttribute("data-type");
                    if (!rowType) return;
                    if (filter === "all" || rowType === filter) {
                        r.style.display = "";
                    } else {
                        r.style.display = "none";
                    }
                });
            });
        });
    }

    // Helper: Escape HTML
    function escapeHtml(str) {
        return String(str || "").replace(/[&<>"']/g, function (m) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
        });
    }

    window.selectSearchProduct = function (productId) {
        window.location.href = `/current-stock?search=${encodeURIComponent(productId)}`;
    };

})();

// ==========================================
// 5. QUICK STOCK MOVEMENT MODAL LOGIC
// ==========================================
window.openQuickMoveModal = function (type, productId) {
    const modal = document.getElementById("quickMoveModal");
    if (!modal) return;
    setQuickMoveType(type || "inward");
    if (productId) {
        const select = document.getElementById("qm_product_select");
        if (select) select.value = productId;
    }
    const qtyInput = document.getElementById("qm_quantity");
    if (qtyInput) qtyInput.value = 1;
    const notesInput = document.getElementById("qm_notes");
    if (notesInput) notesInput.value = "";
    const feedback = document.getElementById("qm_feedback");
    if (feedback) feedback.style.display = "none";

    modal.style.display = "flex";
};

window.closeQuickMoveModal = function () {
    const modal = document.getElementById("quickMoveModal");
    if (modal) modal.style.display = "none";
};

window.setQuickMoveType = function (type) {
    const hidden = document.getElementById("qm_movement_type");
    const btnIn = document.getElementById("btnTypeInward");
    const btnOut = document.getElementById("btnTypeOutward");
    const submitBtn = document.getElementById("qm_submit_btn");

    if (hidden) hidden.value = type;
    if (type === "inward") {
        if (btnIn) btnIn.classList.add("active");
        if (btnOut) btnOut.classList.remove("active");
        if (submitBtn) {
            submitBtn.textContent = "Confirm Inward Stock (+)";
            submitBtn.className = "sg-btn sg-btn-primary";
        }
    } else {
        if (btnOut) btnOut.classList.add("active");
        if (btnIn) btnIn.classList.remove("active");
        if (submitBtn) {
            submitBtn.textContent = "Confirm Outward Dispatch (−)";
            submitBtn.className = "sg-btn sg-btn-danger";
        }
    }
};

window.adjustQuickQty = function (delta) {
    const input = document.getElementById("qm_quantity");
    if (!input) return;
    let val = parseFloat(input.value) || 0;
    val = Math.max(1, val + delta);
    input.value = val;
};

window.setQuickQty = function (val) {
    const input = document.getElementById("qm_quantity");
    if (input) input.value = val;
};

window.handleQuickMoveSubmit = function (e) {
    e.preventDefault();
    const type = document.getElementById("qm_movement_type").value;
    const select = document.getElementById("qm_product_select");
    const productId = select ? select.value : "";
    const qty = parseFloat(document.getElementById("qm_quantity").value) || 0;
    const notes = document.getElementById("qm_notes").value;
    const feedback = document.getElementById("qm_feedback");
    const submitBtn = document.getElementById("qm_submit_btn");

    if (!productId) {
        alert("Please select an instrument product.");
        return;
    }
    if (qty <= 0) {
        alert("Please enter a valid quantity greater than 0.");
        return;
    }

    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "Processing Transaction...";
    }

    fetch("/stock-movement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            product_id: productId,
            movement_type: type,
            quantity: qty,
            notes: notes
        })
    })
    .then(r => r.json())
    .then(data => {
        if (data.success) {
            if (feedback) {
                feedback.className = "sg-feedback success";
                feedback.textContent = `✓ Successfully recorded ${type.toUpperCase()} of ${qty} units. Updating dashboard...`;
                feedback.style.display = "block";
            }
            setTimeout(() => {
                window.location.reload();
            }, 900);
        } else {
            throw new Error(data.error || data.message || "Failed to record movement.");
        }
    })
    .catch(err => {
        if (feedback) {
            feedback.className = "sg-feedback error";
            feedback.textContent = `✕ Error: ${err.message}`;
            feedback.style.display = "block";
        }
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = type === "inward" ? "Confirm Inward Stock (+)" : "Confirm Outward Dispatch (−)";
        }
    });
};

// ==========================================
// 6. EXPORT SUMMARY TO CSV
// ==========================================
window.exportDashboardSummaryCSV = function () {
    const products = (window.DASH_DATA && window.DASH_DATA.products) || [];
    if (!products.length) {
        alert("No inventory records to export.");
        return;
    }

    let csv = "Product ID,Product Name,Category,Quantity,Unit,Location\n";
    products.forEach(p => {
        const id = `"${(p.product_id || '').replace(/"/g, '""')}"`;
        const name = `"${(p.product_name || '').replace(/"/g, '""')}"`;
        const cat = `"${(p.category || '').replace(/"/g, '""')}"`;
        const qty = p.current_quantity || 0;
        const unit = `"${(p.unit || 'Nos').replace(/"/g, '""')}"`;
        const loc = `"${(p.location || '').replace(/"/g, '""')}"`;
        csv += `${id},${name},${cat},${qty},${unit},${loc}\n`;
    });

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const dateStr = new Date().toISOString().split("T")[0];
    link.setAttribute("href", url);
    link.setAttribute("download", `NUNES_Stock_Summary_${dateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

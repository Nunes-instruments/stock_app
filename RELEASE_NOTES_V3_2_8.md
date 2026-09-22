# NUNES STOCK v3.2.8 — Option 3 Current Stock

## Selected design
Implements the selected **Option 3 — Card + Table Hybrid List** for Current Stock.

## Real branch wiring
- Rathinapuri – Nunes Instrumentation (`main` / `stock.db`)
- Gopalapuram – Nunes Instrumentation (`gobalapuram` / `stock_gobalapuram.db`)
- Gandhipuram – Nunes Instrumentation (`gandhipuram` / `stock_gandhipuram.db`)

Changing branch uses the existing server-side session switcher. Current Stock KPIs, product rows, movement totals, location labels and actions are recalculated from the selected branch database.

## Current Stock improvements
- Option 3 hero and soft-gradient layout
- Five real KPI cards: total products, in-stock product count, low-stock product count, outward today, inward today
- Search by product name, ID, category, brand, model or location
- Category and stock-status filtering
- Client-side sorting and pagination
- Branch panel with all three company branches
- Product detail drawer
- Existing archive/restore workflow retained
- Export and Add Stock quick actions retained
- Product thumbnails are constrained to fixed-size cells; missing images fall back safely instead of expanding the page

## Low-stock rule
The current database has no per-product reorder-level field. To avoid inventing hidden values, v3.2.8 explicitly uses `1–5 units` as the low-stock display threshold. Zero quantity is Out of Stock; above five is In Stock.

## Protected storage files
The existing Rack / Shelf / 3D design is preserved byte-for-byte:
- `static/stock_3d.js`
- `static/shelf_rack_3d.js`
- `static/storage_view.js`
- `templates/storage_view.html`

## Update safety
The production preflight now tests Current Stock after switching to each of the three branches before an automatic GitHub update may replace the live 5055 server.

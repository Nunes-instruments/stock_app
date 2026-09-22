# NUNES Stock v3.2.10 — Executive Stock History

## What changed

- Rebuilt **Stock History** to match the Executive Clean List visual system used by Current Stock.
- Stock History now shows the real `stock_entries` movement ledger first instead of only Excel imports.
- Added live summary cards for Total Movements, Inward Quantity, Outward Quantity and Products Touched.
- Added search, movement type, source, date-range filters, sorting, pagination and client-side CSV export.
- Added Inward / Outward status pills and before/after stock quantities.
- Preserved Excel import history in a dedicated second tab.
- History remains branch-aware: Rathinapuri, Gopalapuram and Gandhipuram each read their own SQLite database through the existing Active Company selector.

## Safety

- No database schema changes.
- No stock quantity changes.
- No Rack / Shelf / 3D file changes.
- Current Stock, Add Stock and Add From Excel behavior remains unchanged.

# NUNES Stock v3.1.0 — Production Inventory Release

Release date: 2026-09-22

## What changed

- Preserved the existing Rack, Shelf and 3D Rack implementation byte-for-byte and added a checksum gate so accidental edits fail preflight.
- Corrected the inventory source-of-truth bug: dashboard and Current Stock now include all active products, not only products mapped into Rack/3D categories.
- Kept Rack/3D as a separate mapped view, so the familiar rack workflow remains unchanged.
- Added safe Archive/Restore instead of destructive product deletion; stock history remains intact.
- Added SQLite WAL, busy timeout and serialized stock writes for multi-PC concurrency.
- Added inventory revision tracking and audit events for product creation, stock movement, archive, restore and product changes.
- Added 5-second browser live-sync so staff/owner views detect inventory and release changes from the central server.
- Rebuilt the dashboard and application shell with a clean white/light-blue high-readability interface.
- Main server updater now performs backup, dependency install, preflight, protected-file verification, live health check and automatic rollback.
- Main server scheduled GitHub check changed to every 5 minutes.
- Main startup verifies the NUNES Stock health endpoint rather than treating any process on port 5000 as the application.
- Excel master export now uses the complete active inventory.

## Data safety

Business databases remain outside the Git checkout under `C:\ProgramData\NunesStock\data` after production installation. A code update does not replace stock data. Product archive is reversible and does not delete movement history.

## Protected files

These existing Rack/3D files are intentionally unchanged in v3.1.0:

- `static/stock_3d.js`
- `static/shelf_rack_3d.js`
- `static/storage_view.js`
- `templates/storage_view.html`

## v3.1.1 startup reliability hotfix — 22 Sep 2026
- Replaced the silent batch-only starter with a PowerShell status-first launcher.
- Always displays configured port, version, owner URL, staff URL/IP and PID after health passes.
- Startup failures remain visible and print the last server/error log lines.
- Added `SERVER_STATUS.bat`, `RESTART_MAIN_SERVER.bat`, and `RUN_SERVER_DIAGNOSTIC.bat`.
- Adds a one-minute server watchdog during setup; it restarts NUNES Stock after an unexpected process exit.
- The watchdog never kills an unrelated application occupying port 5000.
- Rack / Shelf / 3D protected files are unchanged.

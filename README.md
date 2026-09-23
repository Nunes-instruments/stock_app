# NUNES Stock v3.2.3 — Port 5055 Main Server

The production entry point is `RUN_THIS_V3_2_3_UPDATE.bat`.

This build keeps the v3.2 Concept 3 Soft Gradient Modern dashboard and fixes the Windows installer so the update console remains visible until the user presses Enter. All installation stages are logged to `C:\ProgramData\NunesStockV31\data\install_v323.log`.

The main server uses port 5055 and stores business data separately under `C:\ProgramData\NunesStockV31\data`. Existing 5055 databases are preserved during updates. Rack / Shelf / 3D protected assets are unchanged from this release's protected manifest.

After installation, open `http://127.0.0.1:5055`. Staff PCs use `http://<MAIN-SERVER-IP>:5055`.


## v3.2.10
Executive Stock History adds a real branch-aware movement ledger with filters, pagination, CSV export, and preserved Excel import history.

## v3.2.12 shared-client + Shelf Rack update

Staff and Owner PCs are browser clients only: run `SETUP_STAFF_PC.bat` or `SETUP_OWNER_PC.bat`, enter the main server address, and use the resulting desktop shortcut. They do not need local application updates because all code is served by the main 5055 server.

Shelf Rack placement is now persisted in each branch database. Use **Attach Product** to place an existing inventory product on a selected rack/shelf. Moving/removing a shelf placement never changes the inventory quantity. Clicking a shelf or rack shows its assigned products below, with current stock and verified online image enrichment when available.

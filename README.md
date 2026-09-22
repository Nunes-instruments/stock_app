# NUNES Stock v3.2.3 — Port 5055 Main Server

The production entry point is `RUN_THIS_V3_2_3_UPDATE.bat`.

This build keeps the v3.2 Concept 3 Soft Gradient Modern dashboard and fixes the Windows installer so the update console remains visible until the user presses Enter. All installation stages are logged to `C:\ProgramData\NunesStockV31\data\install_v323.log`.

The main server uses port 5055 and stores business data separately under `C:\ProgramData\NunesStockV31\data`. Existing 5055 databases are preserved during updates. Rack / Shelf / 3D protected assets are unchanged from this release's protected manifest.

After installation, open `http://127.0.0.1:5055`. Staff PCs use `http://<MAIN-SERVER-IP>:5055`.

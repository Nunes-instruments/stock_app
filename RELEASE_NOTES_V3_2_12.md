# NUNES Stock v3.2.12 — Unified Production Release

Build date: 2026-09-22

This release consolidates the previously approved UI and storage/client work into one cumulative release so an upgrade from v3.2.8 does not miss intermediate files.

## Included in one release

- Current Stock: approved Executive Clean List (v3.2.9 design)
- Add From Excel: approved full-width import workflow (v3.2.9 design)
- Stock History: Executive stock movement ledger with Excel Imports tab (v3.2.10 design)
- Shelf Rack: central branch-aware attach / move / remove / list workflow (v3.2.11)
- Staff + Owner: central-server browser-client model and live version refresh (v3.2.11)
- Main server: port 5055, branch-aware SQLite data, maintenance-aware updater/watchdog coordination

## Data safety

- Runtime databases are never bundled or overwritten.
- Existing branch database files remain under C:\ProgramData\NunesStockV31\data.
- The installer makes database and code backups before replacing live application files.
- Shelf unassign changes only the physical shelf position; it does not reduce inventory quantity.
- GitHub publishing excludes databases, logs, credentials, archives and runtime data.

## Unified release gate

Preflight now requires all of the following in the same candidate release before live code is touched:

1. Executive Current Stock UI on Rathinapuri, Gopalapuram and Gandhipuram.
2. Full-width Add From Excel UI and downloadable Excel template.
3. Executive Stock History UI on all three branches.
4. Shelf Rack attach/move/remove/state APIs on all three branches.
5. Protected Rack / Shelf / 3D checksum validation.


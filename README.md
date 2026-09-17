# NUNES Stock

Central stock-management application for Nunes Instrumentation.

## Production architecture

- **GitHub = application code only.** This repository is the single maintained source for the app.
- **Main server PC = live business data.** SQLite databases, uploaded Excel files, generated master sheets, image cache, backups and the Flask secret are stored under `C:\ProgramData\NunesStock\data` on Windows.
- **Staff/Owner PCs = browser clients only.** They use a desktop shortcut to the main server. They do not keep a separate stock database.
- **Updates are safe.** The main server checks GitHub every 15 minutes. Before a code update it creates a database backup, pulls `main`, updates Python dependencies and restarts the stock server. Live data is outside the Git checkout and is not overwritten.

> Important: this GitHub repository is public. Never commit `.db`, customer files, uploaded spreadsheets, passwords, API keys or `.env` files. `.gitignore` is configured to block the normal runtime data paths.

## First-time main server setup

1. Install **Git for Windows** and **Python 3.12** on the main server PC.
2. Extract the migration package/current app to a temporary folder on the main server.
3. Run `SETUP_MAIN_SERVER.bat` once and approve Administrator permission.
4. Setup preserves existing legacy stock data to `C:\ProgramData\NunesStock\data`, clones this repository to `C:\NunesStock\app`, creates the Python runtime, opens Windows Firewall port 5000, creates Owner/Update desktop shortcuts, and starts the server.
5. The app is available locally at `http://127.0.0.1:5000` and to office PCs at `http://<MAIN-SERVER-IP>:5000`.

## Staff / Owner PC setup

Copy only the small setup package or this repository folder to the client PC and run:

- `SETUP_STAFF_PC.bat` for staff.
- `SETUP_OWNER_PC.bat` for owner.

Enter the main server IP once. A desktop icon is created. Client PCs need no Python, Git or local database.

## Updating code

Normal path: commit/push changes to the `main` branch. The main server's scheduled updater checks every 15 minutes and applies the new code safely.

For an immediate update on the server, use the desktop shortcut **NUNES Stock - Update Server** or run `UPDATE_MAIN_SERVER.bat`.

The updater refuses to overwrite uncommitted tracked code, makes a backup before changes, and leaves the current server version running if GitHub is unreachable.

## Backups

Run `CREATE_BACKUP.bat` any time. Backups are stored under:

`C:\ProgramData\NunesStock\data\backups\YYYYMMDD_HHMMSS`

## Data persistence

The database is intentionally not inside the Git repository. Turning the PC off, restarting Windows, pulling a new Git commit, or replacing the application code does not remove the stock records.

The first migration copies legacy files rather than moving/deleting them, giving an additional recovery path.

## Test/demo cleanup

`CLEAN_OLD_TEST_DATA.bat` is a one-time maintenance utility for the old development database. It removes only explicit test/sample/demo transactions and creates a timestamped backup first. It is **not** executed by normal startup or GitHub updates.

## Version

Current application version: **2.0.0** (2026-09-17).

# NUNES Stock v3.2.3

## Installer / Git reliability hotfix

This release fixes the v3.2.2 installer stopping at Step 7 after Git printed
`Switched to a new branch 'nunes-v3-local'`.

Git uses STDERR for some normal progress/status messages. Windows PowerShell
can surface those messages as errors when `$ErrorActionPreference = 'Stop'`.
v3.2.3 therefore treats native Git and Task Scheduler commands as successful
or failed based on their process exit code, not merely on STDERR output.

### Included safeguards

- Port remains 5055.
- Existing `C:\ProgramData\NunesStockV31\data` is preserved.
- A backup is taken before code replacement.
- Rack / Shelf / 3D protected files remain checksum-protected.
- `origin` is created/corrected safely.
- `nunes-v3-local` is idempotent across reruns.
- The silent 5-minute updater uses safe Git exit-code handling too.
- Recurring watchdog/updater tasks use hidden WScript launchers.
- The visible installer stays open through success or failure.

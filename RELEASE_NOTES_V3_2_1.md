# NUNES Stock v3.2.1

## Installer reliability release

This release keeps the v3.2 Soft Gradient Modern dashboard and port 5055 architecture, while correcting the Windows update flow that could open a second elevated console and then close before the user could see the failure.

### Fixed

- One persistent Administrator update console from start to finish.
- No automatic installer-window close on error or success; user closes it with Enter.
- Numbered 1/10 installation steps with timestamps.
- Permanent installer log at `C:\ProgramData\NunesStockV31\data\install_v321.log`.
- Existing 5055 server is stopped before replacing application code.
- Code rollback if installation fails after application replacement.
- Existing 5055 data is preserved and is not overwritten by the older port-5000 database on updates.
- First-time 5055 setup still takes a safe one-time snapshot from the legacy live data.
- Scheduled watchdog and updater remain true-silent via WScript wrappers.

### Unchanged

- Port: 5055
- Concept 3 Soft Gradient Modern dashboard
- Rack / Shelf / 3D protected files
- Stock database/history policy
- Owner/staff central-server architecture
- GitHub automatic-update design

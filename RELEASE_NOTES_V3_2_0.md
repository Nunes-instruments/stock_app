# NUNES Stock v3.2.0

## Dashboard
- Rebuilt Home dashboard to the selected **Concept 3 — Soft Gradient Modern** design.
- White / light-blue layered UI, soft animated wave header, larger readable KPIs, branch cards, quick actions, recent movement and system-health panel.
- Added subtle motion and hover states with `prefers-reduced-motion` support.
- Rack / Shelf / 3D experience is not modified by this dashboard release.

## Terminal flash fix
The recurring Windows console flash was caused by Task Scheduler launching `.bat` wrappers every minute / every five minutes.

v3.2.0 replaces those recurring jobs with `wscript.exe` wrappers that start PowerShell with no console window.
- 1-minute server watchdog: silent.
- 5-minute GitHub update check: silent.
- Port-5000 recurring watchdog/update tasks from the old recovery are removed when 5055 becomes the main server.
- Manual Status / Restart tools stay visible on purpose.

## GitHub deployment model
- Installed server code is connected to `https://github.com/Nunes-instruments/stock_app.git`.
- The server silently checks `origin/main` every 5 minutes.
- Only a strictly newer `VERSION` is accepted.
- Candidate code is preflighted before live switch.
- Live databases are backed up before switch.
- Failed releases roll back to the previous code version.
- Browser pages poll server state and reload after a newer application version becomes live.

## Production port
- Main v3 server: **5055**.
- Staff URL: `http://MAIN-SERVER-IP:5055`.

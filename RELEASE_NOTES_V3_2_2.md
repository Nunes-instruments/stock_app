# NUNES Stock v3.2.2

## Startup / installer reliability

- Fixed persistent installer Step 7 failure when `.git` exists but `origin` does not.
- Git setup now detects whether `origin` exists, adds it when missing, and corrects its URL when needed.
- Old recurring console-based watchdog/update tasks are disabled before the long install stages, preventing terminal flashes during setup.
- Hidden WScript watchdog and GitHub updater are installed after preflight succeeds.
- Existing port-5055 stock data is preserved and backed up.
- Rack, Shelf and 3D protected files are unchanged.

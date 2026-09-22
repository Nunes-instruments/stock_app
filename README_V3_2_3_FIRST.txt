NUNES STOCK v3.2.8 - PORT 5055 PERSISTENT UPDATE

RUN ONLY:
  RUN_THIS_V3_2_3_UPDATE.bat

WHAT v3.2.8 FIXES
- Fixes the v3.2.2 Step 7 false failure caused by Git writing a successful
  branch-switch message to STDERR.
- Git and Task Scheduler native commands are now judged by EXIT CODE.
- The local nunes-v3-local branch can be created/recreated safely on reruns.
- Missing Git origin is added safely; an incorrect origin is corrected.
- Future 5-minute Git updates use the same safe Git handling.
- Old recurring visible console tasks are disabled near the start.
- New watchdog/updater tasks run through hidden WScript launchers.
- Existing port-5055 stock databases are preserved and backed up.
- Rack / Shelf / 3D protected files remain unchanged.
- Installer window remains visible until you press ENTER.

EXPECTED FINAL URL:
  http://127.0.0.1:5055

INSTALLER LOG:
  C:\ProgramData\NunesStockV31\data\install_v323.log

AFTER INSTALLATION SUCCESS:
  Run PUBLISH_TO_GITHUB.bat once if you want GitHub main to become v3.2.8.
  Future releases with a higher VERSION can then be picked up automatically
  by the silent 5-minute updater.

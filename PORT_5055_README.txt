NUNES STOCK v3.2.3 - PARALLEL MAIN SERVER (PORT 5055)

Purpose
-------
Run this v3 server on the SAME PC while the existing v2.5.2 server continues on port 5000.

Old server (unchanged):
  Code: C:\NunesStock\app
  Data: C:\ProgramData\NunesStock\data
  URL : http://127.0.0.1:5000

New v3 server:
  Code: C:\NunesStockV31\app
  Data: C:\ProgramData\NunesStockV31\data
  URL : http://127.0.0.1:5055

SETUP
-----
1. Extract the ZIP.
2. Right-click SETUP_MAIN_SERVER.bat -> Run as administrator.
3. The installer makes a SAFE SNAPSHOT of the current live SQLite DBs into the new V31 data folder.
4. It does NOT stop or replace the old port-5000 server.
5. Open http://127.0.0.1:5055 and test the new system.
6. Staff/Owner setup points to SERVER-IP:5055.

IMPORTANT
---------
After the snapshot, port 5000 and port 5055 use DIFFERENT database copies. Do not make production stock changes in both systems at the same time. Choose 5055 as the production system only after checking it.

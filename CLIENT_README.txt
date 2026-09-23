NUNES STOCK v3.2.12 - STAFF / OWNER CLIENT MODEL
=================================================

IMPORTANT
- The MAIN SERVER PC runs the application and all branch databases.
- Staff and Owner PCs do NOT install Python, Flask, Git, Node, or a database.
- Their desktop icon opens the main server directly on port 5055.
- Therefore a server-side application update is automatically the new app for every client.

STAFF PC
1. Extract the small Client Setup package.
2. Double-click SETUP_STAFF_PC.bat.
3. Enter the main server IP/hostname.
4. The desktop gets "NUNES Stock - Staff".

OWNER PC
1. Extract the same Client Setup package.
2. Double-click SETUP_OWNER_PC.bat.
3. Enter the main server IP/hostname.
4. The desktop gets "NUNES Stock - Owner".

LIVE UPDATE BEHAVIOUR
- Browser checks /api/system/state every 5 seconds.
- When stock changes, safe read-only pages refresh automatically.
- When the server VERSION changes, idle pages reload automatically.
- If someone is actively typing/editing, the app shows a Reload notice instead of deleting unsaved work.

NETWORK
- Main server must stay running.
- Windows Firewall must allow TCP 5055 on the server.
- Staff/Owner PCs must be able to reach http://SERVER-IP:5055.

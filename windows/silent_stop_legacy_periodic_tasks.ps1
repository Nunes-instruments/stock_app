$ErrorActionPreference = 'SilentlyContinue'
# The port-5000 server can keep running as a fallback, but its recurring
# watchdog/updater tasks are no longer needed once v3 on 5055 is the main server.
# Removing only the recurring tasks prevents the visible console flash every minute.
foreach ($task in @('NUNES Stock Server Watchdog','NUNES Stock Auto Update')) {
    & schtasks.exe /Delete /F /TN $task 2>$null | Out-Null
}

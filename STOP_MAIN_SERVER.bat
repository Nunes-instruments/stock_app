@echo off
setlocal EnableExtensions
set "PIDFILE=C:\ProgramData\NunesStock\data\server.pid"

rem First stop the tracked server PID when available.
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$f='%PIDFILE%'; if(Test-Path $f){$id=[int](Get-Content $f -ErrorAction SilentlyContinue); $p=Get-CimInstance Win32_Process -Filter ('ProcessId='+$id) -ErrorAction SilentlyContinue; if($p -and $p.CommandLine -match 'server_process.py'){Stop-Process -Id $id -Force -ErrorAction SilentlyContinue}; Remove-Item $f -Force -ErrorAction SilentlyContinue}"

rem v2.4.1 fallback: if an older NUNES Stock instance still owns port 5000,
rem identify it through the NUNES health endpoint and stop that exact listener.
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$l=@(Get-NetTCPConnection -State Listen -LocalPort 5000 -ErrorAction SilentlyContinue); if($l.Count -eq 0){Write-Host '[INFO] NUNES Stock server is not running.'; exit 0}; $h=$null; try{$h=Invoke-RestMethod -UseBasicParsing -TimeoutSec 2 'http://127.0.0.1:5000/api/system/health'}catch{}; if($h -and [string]$h.status -eq 'online'){foreach($id in @($l|Select-Object -ExpandProperty OwningProcess -Unique)){Stop-Process -Id $id -Force -ErrorAction SilentlyContinue}; Write-Host '[OK] NUNES Stock server stopped.'; exit 0}; Write-Host '[SAFE] Port 5000 belongs to another service; it was not stopped.'; exit 2"
exit /b %ERRORLEVEL%

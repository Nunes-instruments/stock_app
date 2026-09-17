@echo off
setlocal
set "PIDFILE=C:\ProgramData\NunesStock\data\server.pid"
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$f='%PIDFILE%'; if(Test-Path $f){$id=[int](Get-Content $f -ErrorAction SilentlyContinue); $p=Get-CimInstance Win32_Process -Filter ('ProcessId='+$id) -ErrorAction SilentlyContinue; if($p -and $p.CommandLine -match 'server_process.py'){Stop-Process -Id $id -Force -ErrorAction SilentlyContinue; Write-Host '[OK] Server stopped.'} else {Write-Host '[INFO] PID file was stale; no NUNES server process was killed.'}; Remove-Item $f -Force -ErrorAction SilentlyContinue} else {Write-Host '[INFO] Server is not running.'}"

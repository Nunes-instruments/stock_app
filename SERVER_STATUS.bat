@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title NUNES Stock V3 Server 5055 Status
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0windows\start_main_server.ps1" -StatusOnly
set "RC=%ERRORLEVEL%"
echo.
echo Press any key to close this status window.
pause >nul
exit /b %RC%

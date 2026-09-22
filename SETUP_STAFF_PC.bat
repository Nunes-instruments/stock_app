@echo off
setlocal EnableExtensions
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0windows\setup_client.ps1" -Role "Staff"
set "RC=%ERRORLEVEL%"
if not "%RC%"=="0" echo [ERROR] NUNES Stock Staff setup did not complete.
pause
exit /b %RC%

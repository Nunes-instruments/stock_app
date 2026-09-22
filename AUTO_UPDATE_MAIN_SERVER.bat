@echo off
setlocal EnableExtensions
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0windows\update_main_server.ps1"
exit /b %ERRORLEVEL%

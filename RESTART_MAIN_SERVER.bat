@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title NUNES Stock V3 Server 5055 Restart
echo Restarting only the NUNES Stock server...
call "%~dp0STOP_MAIN_SERVER.bat"
timeout /t 1 /nobreak >nul
call "%~dp0START_MAIN_SERVER.bat"
exit /b %ERRORLEVEL%

@echo off
setlocal
cd /d "%~dp0"
echo This legacy starter is kept for compatibility.
echo Starting the new persistent main-server launcher...
call "%~dp0START_MAIN_SERVER.bat"
exit /b %ERRORLEVEL%

@echo off
setlocal
cd /d "%~dp0"
echo This shortcut now forwards to the v3.2.12 persistent installer.
call "%~dp0RUN_THIS_V3_2_3_UPDATE.bat"
exit /b %ERRORLEVEL%

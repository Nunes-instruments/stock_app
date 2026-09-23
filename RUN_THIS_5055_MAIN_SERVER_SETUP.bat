@echo off
setlocal
cd /d "%~dp0"
echo Starting the v3.2.12 persistent port-5055 setup...
call "%~dp0RUN_THIS_V3_2_3_UPDATE.bat"
exit /b %ERRORLEVEL%

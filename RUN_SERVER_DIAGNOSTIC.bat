@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title NUNES Stock Foreground Diagnostic
set "NUNES_STOCK_DATA_DIR=C:\ProgramData\NunesStockV31\data"
set "NUNES_STOCK_PORT=5055"
set "PY=%LOCALAPPDATA%\NunesStockRuntimeV31\venv\Scripts\python.exe"
echo ============================================================
echo  NUNES STOCK FOREGROUND DIAGNOSTIC
echo ============================================================
echo Port       : 5055
echo Runtime    : %PY%
echo App folder : %CD%
echo.
if not exist "%PY%" (
  echo [ERROR] Python runtime is missing. Run SETUP_MAIN_SERVER.bat first.
  pause
  exit /b 1
)
call "%~dp0STOP_MAIN_SERVER.bat"
echo.
echo Starting server in this window. Any Python error will stay visible.
echo Press Ctrl+C only when you intentionally want to stop this diagnostic server.
echo.
"%PY%" "%~dp0scripts\server_process.py"
set "RC=%ERRORLEVEL%"
echo.
echo Server process ended with code %RC%.
echo Review the traceback above and C:\ProgramData\NunesStockV31\data\server.log
pause
exit /b %RC%

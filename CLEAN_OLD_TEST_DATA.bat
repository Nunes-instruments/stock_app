@echo off
setlocal
cd /d "%~dp0"
echo =====================================================
echo NUNES STOCK - SAFE OLD TEST DATA CLEANUP
echo =====================================================
echo This removes only SAMPLE/DEMO imports and explicit TEST rows.
echo A timestamped database backup is created first.
echo.
set "PY=python"
if exist "%LOCALAPPDATA%\NunesStockRuntime\venv\Scripts\python.exe" set "PY=%LOCALAPPDATA%\NunesStockRuntime\venv\Scripts\python.exe"
if exist "stock.db" (
  "%PY%" scripts\cleanup_test_data.py "%CD%\stock.db"
) else (
  echo Legacy stock.db was not found in this folder.
  echo If the server is already installed, production data is in C:\ProgramData\NunesStock\data\db and is NOT changed by this tool.
)
echo.
pause

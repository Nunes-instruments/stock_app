@echo off
setlocal
cd /d "%~dp0"
set "NUNES_STOCK_DATA_DIR=C:\ProgramData\NunesStock\data"
set "PY=%LOCALAPPDATA%\NunesStockRuntime\venv\Scripts\python.exe"
if not exist "%PY%" set "PY=python"
"%PY%" -m scripts.backup_data
pause

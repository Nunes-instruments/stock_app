@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0windows\setup_client.ps1" -Role "Owner"
pause

@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title NUNES Stock v3.2.8 - Persistent Update
powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0windows\run_update_visible.ps1"
set "RC=%ERRORLEVEL%"
exit /b %RC%

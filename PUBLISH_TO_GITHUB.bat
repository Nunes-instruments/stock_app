@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title NUNES Stock - Publish to GitHub
set "REPO=https://github.com/Nunes-instruments/stock_app.git"

echo =====================================================
echo NUNES STOCK - SAFE GITHUB PUBLISH
echo =====================================================
echo.
where git >nul 2>&1
if errorlevel 1 (
  echo ERROR: Git for Windows is not installed.
  echo Install Git, then run this file again.
  if /I not "%~1"=="--no-pause" pause
  exit /b 1
)

if not exist ".git" (
  git init
  if errorlevel 1 goto :FAIL
)

git branch -M main >nul 2>&1

rem Repository-only identity. This does not change Git settings for other projects.
git config user.name "Nunes Instruments Stock Server"
git config user.email "stock-server@nunes.local"

rem Line endings are controlled by .gitattributes, not by a global Windows setting.
git config core.autocrlf false
git config core.safecrlf false

git remote get-url origin >nul 2>&1
if errorlevel 1 (
  git remote add origin "%REPO%"
) else (
  git remote set-url origin "%REPO%"
)

echo [1/5] Checking business-data protection...
git check-ignore stock.db >nul 2>&1
if errorlevel 1 (
  echo ERROR: stock.db is not ignored. Publish stopped for safety.
  if /I not "%~1"=="--no-pause" pause
  exit /b 1
)
git check-ignore stock_gandhipuram.db >nul 2>&1
if errorlevel 1 (
  echo ERROR: branch database is not ignored. Publish stopped for safety.
  if /I not "%~1"=="--no-pause" pause
  exit /b 1
)

echo [2/5] Applying Windows/Git line-ending rules...
git add .gitattributes .gitignore >nul 2>&1

echo [3/5] Adding CODE only...
git add .
if errorlevel 1 goto :FAIL
rem Re-normalize any files that were already staged by an earlier failed publish.
git add --renormalize . >nul 2>&1
if errorlevel 1 goto :FAIL

echo [4/5] Creating commit if needed...
git diff --cached --quiet
if errorlevel 1 (
  git commit -m "NUNES Stock v2.4.2 - production release"
  if errorlevel 1 goto :FAIL
) else (
  echo No new code changes to commit.
)

echo [5/5] Publishing to GitHub main...
echo GitHub may open a sign-in window on first use.
git push -u origin main
if errorlevel 1 goto :FAIL

echo.
echo =====================================================
echo [OK] GITHUB PUBLISH COMPLETE
echo =====================================================
echo Repository: %REPO%
echo Git identity: repository-only Nunes Instruments Stock Server
echo Databases, uploads, backups and runtime data were NOT uploaded.
echo.
if /I not "%~1"=="--no-pause" pause
exit /b 0

:FAIL
echo.
echo =====================================================
echo ERROR: GitHub publish did not complete.
echo =====================================================
echo No stock database was deleted.
echo If the message is about GitHub authentication, sign in when prompted
 echo and run this file again.
echo.
if /I not "%~1"=="--no-pause" pause
exit /b 1

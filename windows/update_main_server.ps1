param([switch]$Interactive)
$ErrorActionPreference = 'Stop'
$AppDir = Split-Path -Parent $PSScriptRoot
$DataDir = 'C:\ProgramData\NunesStock\data'
$RuntimePython = Join-Path $env:LOCALAPPDATA 'NunesStockRuntime\venv\Scripts\python.exe'
$env:NUNES_STOCK_DATA_DIR = $DataDir
$env:NUNES_STOCK_PORT = '5000'

function Say($text){ if($Interactive){Write-Host $text} }
if(-not(Test-Path (Join-Path $AppDir '.git'))){ Say '[INFO] This folder is not yet connected to GitHub. Run SETUP_MAIN_SERVER.bat.'; exit 0 }
if(-not(Test-Path $RuntimePython)){ Say '[INFO] Runtime missing. Run SETUP_MAIN_SERVER.bat.'; exit 0 }

Push-Location $AppDir
try {
    $dirty = git status --porcelain --untracked-files=no
    if($dirty){ Say '[SAFE] Local code has uncommitted changes; automatic update skipped.'; exit 0 }
    git fetch origin main --quiet
    if($LASTEXITCODE -ne 0){ Say '[INFO] GitHub is not reachable; current server continues unchanged.'; exit 0 }
    $local = (git rev-parse HEAD).Trim()
    $remote = (git rev-parse origin/main).Trim()
    if($local -eq $remote){ Say '[OK] Already on the latest GitHub version.'; exit 0 }

    Say '[1/4] Creating database backup...'
    & $RuntimePython scripts\backup_data.py | Out-Null

    Say '[2/4] Stopping only the NUNES Stock server process...'
    $pidFile = Join-Path $DataDir 'server.pid'
    if(Test-Path $pidFile){
        $serverPid = [int](Get-Content $pidFile -ErrorAction SilentlyContinue)
        $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$serverPid" -ErrorAction SilentlyContinue
        if($proc -and $proc.CommandLine -match 'server_process.py'){ Stop-Process -Id $serverPid -Force -ErrorAction SilentlyContinue }
        Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
    }

    Say '[3/4] Pulling code from GitHub...'
    git pull --ff-only origin main
    if($LASTEXITCODE -ne 0){ throw 'Git pull failed. Data was not changed.' }
    & $RuntimePython -m pip install --disable-pip-version-check -q -r requirements_portable.txt

    Say '[4/4] Starting updated server...'
    & (Join-Path $AppDir 'START_MAIN_SERVER.bat') --hidden
    Say '[OK] Server updated. Staff/owner browsers will use the new version on refresh.'
} finally { Pop-Location }

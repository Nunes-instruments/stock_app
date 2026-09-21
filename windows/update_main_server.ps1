param([switch]$Interactive)

$ErrorActionPreference = 'Stop'
$AppDir = Split-Path -Parent $PSScriptRoot
$DataDir = 'C:\ProgramData\NunesStock\data'
$RuntimePython = Join-Path $env:LOCALAPPDATA 'NunesStockRuntime\venv\Scripts\python.exe'
$env:NUNES_STOCK_DATA_DIR = $DataDir
$env:NUNES_STOCK_PORT = '5000'
$TaskName = 'NUNES Stock Auto Update'
$UpdateBat = Join-Path $AppDir 'AUTO_UPDATE_MAIN_SERVER.bat'
$StartBat = Join-Path $AppDir 'START_MAIN_SERVER.bat'
$PidFile = Join-Path $DataDir 'server.pid'

function Say([string]$Text) {
    if ($Interactive) { Write-Host $Text }
}

function Ensure-FiveMinuteUpdateTask {
    try {
        $taskCommand = ('"{0}"' -f $UpdateBat)
        & schtasks.exe /Create /F /SC MINUTE /MO 5 /TN $TaskName /TR $taskCommand /RL HIGHEST | Out-Null
        Say '[OK] GitHub update check is set to every 5 minutes.'
    }
    catch {
        Say '[INFO] Could not refresh the 5-minute task; existing schedule is unchanged.'
    }
}

function Stop-NunesServer {
    if (Test-Path $PidFile) {
        $serverPid = [int](Get-Content $PidFile -ErrorAction SilentlyContinue)
        $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$serverPid" -ErrorAction SilentlyContinue
        if ($proc -and $proc.CommandLine -match 'server_process.py') {
            Stop-Process -Id $serverPid -Force -ErrorAction SilentlyContinue
        }
        Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
    }
}

function Start-NunesServer {
    & $StartBat --hidden
    if ($LASTEXITCODE -ne 0) {
        throw 'NUNES Stock server start command failed.'
    }
}

function Test-NunesHealth {
    for ($attempt = 1; $attempt -le 12; $attempt++) {
        try {
            $response = Invoke-WebRequest -UseBasicParsing -TimeoutSec 4 'http://127.0.0.1:5000/api/system/health'
            if ($response.StatusCode -eq 200) { return $true }
        }
        catch {
            Start-Sleep -Seconds 2
        }
    }
    return $false
}

if (-not (Test-Path (Join-Path $AppDir '.git'))) {
    Say '[INFO] This folder is not connected to GitHub. Run SETUP_MAIN_SERVER.bat.'
    exit 0
}

if (-not (Test-Path $RuntimePython)) {
    Say '[INFO] Runtime missing. Run SETUP_MAIN_SERVER.bat.'
    exit 0
}

Ensure-FiveMinuteUpdateTask

Push-Location $AppDir
$PreviousCommit = $null

try {
    $dirty = git status --porcelain --untracked-files=no
    if ($dirty) {
        Say '[SAFE] Local code has uncommitted changes; automatic update skipped.'
        exit 0
    }

    git fetch origin main --quiet
    if ($LASTEXITCODE -ne 0) {
        Say '[INFO] GitHub is not reachable; current server continues unchanged.'
        exit 0
    }

    $local = (git rev-parse HEAD).Trim()
    $remote = (git rev-parse origin/main).Trim()

    if ($local -eq $remote) {
        Say '[OK] Already on the latest GitHub version.'
        exit 0
    }

    $PreviousCommit = $local

    Say '[1/6] Creating database backup...'
    & $RuntimePython -m scripts.backup_data | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw 'Database backup failed. Update stopped before changing code.'
    }

    Say '[2/6] Stopping only the NUNES Stock server process...'
    Stop-NunesServer

    Say '[3/6] Applying the fetched GitHub release...'
    git merge --ff-only origin/main
    if ($LASTEXITCODE -ne 0) {
        throw 'Git update failed. Data was not changed.'
    }

    Say '[4/6] Updating dependencies and checking source...'
    & $RuntimePython -m pip install --disable-pip-version-check -q -r requirements_portable.txt
    if ($LASTEXITCODE -ne 0) {
        throw 'Python dependency update failed.'
    }

    & $RuntimePython -m compileall -q -x '(^|[\\/])(\.git|__pycache__)([\\/]|$)' .
    if ($LASTEXITCODE -ne 0) {
        throw 'Python source preflight failed.'
    }

    $ProtectedCheck = Join-Path $AppDir 'scripts\verify_protected_ui.py'
    if (Test-Path $ProtectedCheck) {
        & $RuntimePython $ProtectedCheck
        if ($LASTEXITCODE -ne 0) {
            throw 'Protected Rack/Shelf UI verification failed.'
        }
    }

    Say '[5/6] Starting updated server...'
    Start-NunesServer

    Say '[6/6] Verifying server health...'
    if (-not (Test-NunesHealth)) {
        throw 'Updated server did not pass the health check.'
    }

    Ensure-FiveMinuteUpdateTask
    Say '[OK] Server updated safely. Staff and owner browsers receive the new version on refresh.'
}
catch {
    $message = $_.Exception.Message
    Say ("[ERROR] " + $message)

    if ($PreviousCommit) {
        Say '[ROLLBACK] Restoring the previous working code...'
        try {
            Stop-NunesServer
            git reset --hard $PreviousCommit | Out-Null
            & $RuntimePython -m pip install --disable-pip-version-check -q -r requirements_portable.txt
            Start-NunesServer
            if (Test-NunesHealth) {
                Say '[ROLLBACK OK] Previous server version is running again.'
            }
            else {
                Say '[ROLLBACK WARNING] Previous code was restored but health check is still failing. Check server.log.'
            }
        }
        catch {
            Say '[ROLLBACK FAILED] Check server.log and run START_MAIN_SERVER.bat manually.'
        }
    }

    if ($Interactive) { exit 1 }
    exit 0
}
finally {
    Pop-Location
}

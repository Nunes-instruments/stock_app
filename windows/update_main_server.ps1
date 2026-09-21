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

function Get-ExpectedVersion {
    $versionFile = Join-Path $AppDir 'VERSION'
    if (-not (Test-Path $versionFile)) { return '' }
    return (Get-Content $versionFile -Raw).Trim()
}

function Get-NunesHealth {
    try {
        return Invoke-RestMethod -UseBasicParsing -TimeoutSec 3 'http://127.0.0.1:5000/api/system/health'
    }
    catch {
        return $null
    }
}

function Ensure-FiveMinuteUpdateTask {
    try {
        $taskCommand = ('"{0}"' -f $UpdateBat)
        & schtasks.exe /Create /F /SC MINUTE /MO 5 /TN $TaskName /TR $taskCommand /RL HIGHEST 2>$null | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Say '[OK] GitHub update check is set to every 5 minutes.'
            return $true
        }
        Say '[INFO] Task Scheduler permission unavailable; existing schedule is unchanged.'
        return $false
    }
    catch {
        Say '[INFO] Task Scheduler permission unavailable; existing schedule is unchanged.'
        return $false
    }
}


function Stop-NunesServer {
    if (Test-Path $PidFile) {
        try {
            $serverPid = [int](Get-Content $PidFile -ErrorAction Stop)
            $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$serverPid" -ErrorAction SilentlyContinue
            if ($proc -and $proc.CommandLine -match 'server_process.py') {
                Stop-Process -Id $serverPid -Force -ErrorAction SilentlyContinue
            }
        }
        catch {}
        Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
    }

    # v2.5.2 fallback: if a stale/older NUNES Stock listener still owns port 5000,
    # confirm it through the NUNES health endpoint before stopping it.
    $listeners = @(Get-NetTCPConnection -State Listen -LocalPort 5000 -ErrorAction SilentlyContinue)
    if ($listeners.Count -gt 0) {
        $health = Get-NunesHealth
        if (-not $health -or [string]$health.status -ne 'online') {
            throw 'Port 5000 is occupied by a non-NUNES service. Automatic update will not kill it.'
        }
        foreach ($processId in @($listeners | Select-Object -ExpandProperty OwningProcess -Unique)) {
            Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
        }
    }

    for ($i = 0; $i -lt 15; $i++) {
        if (@(Get-NetTCPConnection -State Listen -LocalPort 5000 -ErrorAction SilentlyContinue).Count -eq 0) { return }
        Start-Sleep -Milliseconds 300
    }
    if (@(Get-NetTCPConnection -State Listen -LocalPort 5000 -ErrorAction SilentlyContinue).Count -ne 0) {
        throw 'NUNES Stock server did not release port 5000.'
    }
}

function Start-NunesServer {
    & $StartBat --hidden
    if ($LASTEXITCODE -ne 0) {
        throw 'NUNES Stock server start command failed.'
    }
}

function Test-NunesHealth {
    $expected = Get-ExpectedVersion
    for ($attempt = 1; $attempt -le 15; $attempt++) {
        $response = Get-NunesHealth
        if ($response -and [string]$response.status -eq 'online' -and [string]$response.version -eq $expected) {
            return $true
        }
        Start-Sleep -Seconds 1
    }
    return $false
}

if (-not (Test-Path (Join-Path $AppDir '.git'))) {
    Say '[INFO] This folder is not connected to GitHub. Run the v2.5.2 full setup.'
    exit 0
}

if (-not (Test-Path $RuntimePython)) {
    Say '[INFO] Runtime missing. Run the v2.5.2 full setup.'
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

    Say '[2/6] Stopping the actual NUNES Stock listener...'
    Stop-NunesServer

    Say '[3/6] Applying the fetched GitHub release...'
    git merge --ff-only origin/main
    if ($LASTEXITCODE -ne 0) {
        throw 'Git update failed. Data was not changed.'
    }

    Say '[4/6] Updating dependencies and checking source...'
    & $RuntimePython -m pip install --disable-pip-version-check -q -r requirements_portable.txt
    if ($LASTEXITCODE -ne 0) { throw 'Python dependency update failed.' }

    & $RuntimePython -m compileall -q -x '(^|[\/])(\.git|__pycache__)([\/]|$)' .
    if ($LASTEXITCODE -ne 0) { throw 'Python source preflight failed.' }

    $ProtectedCheck = Join-Path $AppDir 'scripts\verify_protected_ui.py'
    if (Test-Path $ProtectedCheck) {
        & $RuntimePython $ProtectedCheck
        if ($LASTEXITCODE -ne 0) { throw 'Protected Rack/Shelf UI verification failed.' }
    }

    Say '[5/6] Starting updated server...'
    Start-NunesServer

    Say '[6/6] Verifying the exact running version...'
    if (-not (Test-NunesHealth)) {
        throw ('Updated server did not report expected VERSION ' + (Get-ExpectedVersion) + '.')
    }

    Ensure-FiveMinuteUpdateTask
    Say ('[OK] Server updated safely to v' + (Get-ExpectedVersion) + '.')
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
                Say '[ROLLBACK WARNING] Previous code was restored but health check still failed.'
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

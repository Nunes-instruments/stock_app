param([switch]$Interactive)
$ErrorActionPreference = 'Stop'

$AppDir = Split-Path -Parent $PSScriptRoot
$DataDir = 'C:\ProgramData\NunesStockV31\data'
$RuntimePython = Join-Path $env:LOCALAPPDATA 'NunesStockRuntimeV31\venv\Scripts\python.exe'
$env:NUNES_STOCK_DATA_DIR = $DataDir
$env:NUNES_STOCK_PORT = '5055'
$CandidateDir = Join-Path $env:TEMP 'NunesStockV31_Update_Candidate'
$MaintenanceLock = Join-Path $DataDir 'maintenance.lock'
$script:OwnsMaintenanceLock = $false

function Say($text, $color='Gray') { if($Interactive){ Write-Host $text -ForegroundColor $color } }

$script:GitExitCode = 0
$script:GitOutput = @()
function Invoke-GitSafe {
    param([string[]]$Arguments = @(), [switch]$Quiet)

    $previousPreference = $ErrorActionPreference
    $output = @()
    $exitCode = 1
    try {
        # Git may use STDERR for normal progress/status messages. Do not let
        # ErrorActionPreference=Stop convert successful Git progress into a
        # terminating PowerShell error.
        $ErrorActionPreference = 'Continue'
        $output = @(& git.exe @Arguments 2>&1)
        $exitCode = $LASTEXITCODE
        if ($null -eq $exitCode) { $exitCode = 0 }
    }
    finally {
        $ErrorActionPreference = $previousPreference
    }

    $script:GitExitCode = [int]$exitCode
    $script:GitOutput = @($output | ForEach-Object { [string]$_ })
    if (-not $Quiet -and $Interactive) {
        foreach ($line in $script:GitOutput) {
            if (-not [string]::IsNullOrWhiteSpace($line)) { Write-Host $line }
        }
    }
    return $script:GitExitCode
}
function Get-LocalVersion {
    $path = Join-Path $AppDir 'VERSION'
    if(Test-Path $path){ return (Get-Content $path -Raw).Trim() }
    return '0.0.0'
}
function Convert-VersionParts([string]$value) {
    $raw = ($value -replace '[^0-9\.]','').Split('.')
    $parts = @(0,0,0,0)
    for($i=0; $i -lt [Math]::Min($raw.Count,4); $i++){
        $n=0; if([int]::TryParse($raw[$i],[ref]$n)){ $parts[$i]=$n }
    }
    return ,$parts
}
function Compare-Version([string]$left,[string]$right) {
    $a=Convert-VersionParts $left; $b=Convert-VersionParts $right
    for($i=0;$i -lt 4;$i++){
        if($a[$i] -gt $b[$i]){ return 1 }
        if($a[$i] -lt $b[$i]){ return -1 }
    }
    return 0
}
function Get-NunesHealth {
    try { return Invoke-RestMethod -UseBasicParsing -TimeoutSec 4 'http://127.0.0.1:5055/api/system/health' } catch { return $null }
}
function Start-StockServer([string]$expectedVersion='') {
    & (Join-Path $AppDir 'START_MAIN_SERVER.bat') --hidden
    if($LASTEXITCODE -ne 0){ return $false }
    for($i=0;$i -lt 15;$i++){
        $health=Get-NunesHealth
        if($health -and [string]$health.status -eq 'online'){
            if(-not $expectedVersion -or [string]$health.version -eq $expectedVersion){ return $true }
        }
        Start-Sleep -Seconds 1
    }
    return $false
}
function Get-Listener {
    try { return Get-NetTCPConnection -State Listen -LocalPort 5055 -ErrorAction SilentlyContinue | Select-Object -First 1 }
    catch { return $null }
}
function Get-ProcessCommandLine([int]$ProcessId) {
    try {
        $proc = Get-CimInstance Win32_Process -Filter ("ProcessId={0}" -f $ProcessId) -ErrorAction SilentlyContinue
        if($proc){ return [string]$proc.CommandLine }
    } catch {}
    return ''
}
function Test-NunesListener($listener,$health=$null) {
    if(-not $listener){ return $false }
    if($health -and [string]$health.status -eq 'online'){ return $true }
    $cmd=Get-ProcessCommandLine ([int]$listener.OwningProcess)
    return [bool]($cmd -match 'server_process\.py' -and $cmd -match 'NunesStockV31')
}
function Enter-Maintenance {
    New-Item -ItemType Directory -Force -Path $DataDir | Out-Null
    Set-Content -Path $MaintenanceLock -Value ("auto-update PID={0}; started={1}" -f $PID,(Get-Date -Format 's')) -Encoding ASCII
    $script:OwnsMaintenanceLock=$true
    $env:NUNES_STOCK_MAINTENANCE_OWNER='1'
}
function Exit-Maintenance {
    if($script:OwnsMaintenanceLock){ Remove-Item $MaintenanceLock -Force -ErrorAction SilentlyContinue }
    $script:OwnsMaintenanceLock=$false
    Remove-Item Env:NUNES_STOCK_MAINTENANCE_OWNER -ErrorAction SilentlyContinue
}
function Stop-StockServer {
    $stableFree=0
    for($i=1;$i -le 25;$i++){
        $listener=Get-Listener
        if(-not $listener){
            $stableFree++
            if($stableFree -ge 2){
                Remove-Item (Join-Path $DataDir 'server.pid') -Force -ErrorAction SilentlyContinue
                return
            }
            Start-Sleep -Seconds 1
            continue
        }
        $stableFree=0
        $health=Get-NunesHealth
        if(Test-NunesListener $listener $health){
            Stop-Process -Id $listener.OwningProcess -Force -ErrorAction SilentlyContinue
            Start-Sleep -Milliseconds 800
            continue
        }
        throw ("Port 5055 is owned by unrelated/unverified PID {0}; automatic update stopped safely." -f $listener.OwningProcess)
    }
    $listener=Get-Listener
    if($listener){ throw ("NUNES listener PID {0} would not release port 5055." -f $listener.OwningProcess) }
}
function Remove-Candidate {
    if(Test-Path $CandidateDir){
        try {
            Invoke-GitSafe -Arguments @('-C',$AppDir,'worktree','remove','--force',$CandidateDir) -Quiet | Out-Null
        } catch {}
        if(Test-Path $CandidateDir){ Remove-Item $CandidateDir -Recurse -Force -ErrorAction SilentlyContinue }
    }
}

if(Test-Path $MaintenanceLock){
    $age=0.0
    try { $age=((Get-Date)-(Get-Item $MaintenanceLock).LastWriteTime).TotalMinutes } catch {}
    if($age -lt 15){ Say '[INFO] NUNES Stock maintenance is already in progress. Automatic update skipped.' Yellow; exit 0 }
    Remove-Item $MaintenanceLock -Force -ErrorAction SilentlyContinue
}

if(-not(Test-Path (Join-Path $AppDir '.git'))){ Say '[INFO] GitHub is not connected yet. Run SETUP_MAIN_SERVER.bat.' Yellow; exit 0 }
if(-not(Test-Path $RuntimePython)){ Say '[INFO] Python runtime is missing. Run SETUP_MAIN_SERVER.bat.' Yellow; exit 0 }

Push-Location $AppDir
$oldCommit=$null
$oldVersion=Get-LocalVersion
try {
    Invoke-GitSafe -Arguments @('status','--porcelain','--untracked-files=no') -Quiet | Out-Null
    if($script:GitExitCode -ne 0){ Say '[SAFE] Unable to read local Git status. Automatic update skipped.' Yellow; exit 0 }
    $dirty = ($script:GitOutput -join "`n").Trim()
    if($dirty){ Say '[SAFE] Local tracked code has uncommitted changes. Automatic update skipped.' Yellow; exit 0 }

    Invoke-GitSafe -Arguments @('fetch','origin','main','--quiet') -Quiet | Out-Null
    if($script:GitExitCode -ne 0){ Say '[INFO] GitHub is not reachable. Current live server continues unchanged.' Yellow; exit 0 }

    Invoke-GitSafe -Arguments @('show','origin/main:VERSION') -Quiet | Out-Null
    if($script:GitExitCode -ne 0){ Say '[SAFE] Remote VERSION is missing. Update skipped.' Yellow; exit 0 }
    $remoteVersion = ($script:GitOutput -join "`n").Trim()
    if(-not $remoteVersion){ Say '[SAFE] Remote VERSION is missing. Update skipped.' Yellow; exit 0 }

    $compare=Compare-Version $remoteVersion $oldVersion
    if($compare -le 0){
        Say ("[SAFE] Installed v{0}; GitHub main v{1}. No downgrade/equal reset allowed." -f $oldVersion,$remoteVersion) Green
        exit 0
    }

    Invoke-GitSafe -Arguments @('rev-parse','origin/main') -Quiet | Out-Null
    if($script:GitExitCode -ne 0){ Say '[SAFE] Unable to resolve GitHub main commit. Update skipped.' Yellow; exit 0 }
    $newCommit=($script:GitOutput -join '').Trim()
    Invoke-GitSafe -Arguments @('rev-parse','HEAD') -Quiet | Out-Null
    if($script:GitExitCode -ne 0){ Say '[SAFE] Unable to resolve installed commit. Update skipped.' Yellow; exit 0 }
    $oldCommit=($script:GitOutput -join '').Trim()
    Say ("[UPDATE] Candidate GitHub v{0} is newer than installed v{1}." -f $remoteVersion,$oldVersion) Cyan

    Remove-Candidate
    Say '[1/7] Creating isolated candidate worktree...' Cyan
    Invoke-GitSafe -Arguments @('worktree','add','--detach',$CandidateDir,$newCommit) | Out-Null
    if($script:GitExitCode -ne 0){ throw 'Unable to create candidate worktree.' }

    $candidatePreflight=Join-Path $CandidateDir 'scripts\preflight.py'
    if(-not(Test-Path $candidatePreflight)){ throw 'Remote release has no production preflight. Update refused.' }

    Say '[2/7] Installing candidate dependencies...' Cyan
    & $RuntimePython -m pip install --disable-pip-version-check -q -r (Join-Path $CandidateDir 'requirements_portable.txt')
    if($LASTEXITCODE -ne 0){ throw 'Candidate dependency installation failed.' }

    Say '[3/7] Running candidate isolated preflight...' Cyan
    & $RuntimePython $candidatePreflight
    if($LASTEXITCODE -ne 0){ throw 'Candidate preflight failed. Live server was not stopped.' }

    Enter-Maintenance
    Say '[4/7] Backing up all live stock databases...' Cyan
    & $RuntimePython -m scripts.backup_data | Out-Null
    if($LASTEXITCODE -ne 0){ throw 'Live database backup failed. Update stopped.' }

    Say '[5/7] Switching central server code...' Cyan
    Stop-StockServer
    Invoke-GitSafe -Arguments @('reset','--hard',$newCommit) | Out-Null
    if($script:GitExitCode -ne 0){ throw 'Unable to switch working tree to candidate release.' }

    Say '[6/7] Starting and health-checking the new release...' Cyan
    if(-not(Start-StockServer $remoteVersion)){
        throw "Candidate v$remoteVersion did not become healthy."
    }

    Exit-Maintenance
    Say '[7/7] Update completed.' Cyan
    Say ("[OK] NUNES Stock v{0} is live. Browsers will detect the new server version automatically." -f $remoteVersion) Green
}
catch {
    $message=$_.Exception.Message
    Say ("[ERROR] $message") Red
    if($oldCommit){
        Say '[ROLLBACK] Restoring previous production code...' Yellow
        try {
            Stop-StockServer
            Invoke-GitSafe -Arguments @('reset','--hard',$oldCommit) | Out-Null
            if($script:GitExitCode -ne 0){ throw 'Unable to restore previous Git commit.' }
            & $RuntimePython -m pip install --disable-pip-version-check -q -r (Join-Path $AppDir 'requirements_portable.txt') | Out-Null
            if(Start-StockServer $oldVersion){ Say ("[ROLLBACK OK] v$oldVersion is running again.") Green }
            else { Say '[ROLLBACK WARNING] Code restored, but server health check failed. Check server.log.' Red }
        } catch { Say '[ROLLBACK FAILED] Run START_MAIN_SERVER.bat manually and inspect server.log.' Red }
    }
    if($Interactive){ exit 1 } else { exit 0 }
}
finally {
    try { Exit-Maintenance } catch {}
    Remove-Candidate
    Pop-Location
}

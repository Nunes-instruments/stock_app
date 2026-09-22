param(
    [switch]$Hidden,
    [switch]$StatusOnly
)

$ErrorActionPreference = 'Stop'
$AppDir = Split-Path -Parent $PSScriptRoot
$DataDir = 'C:\ProgramData\NunesStockV31\data'
$RuntimePython = Join-Path $env:LOCALAPPDATA 'NunesStockRuntimeV31\venv\Scripts\python.exe'
$VersionFile = Join-Path $AppDir 'VERSION'
$ServerScript = Join-Path $AppDir 'scripts\server_process.py'
$PidFile = Join-Path $DataDir 'server.pid'
$ServerLog = Join-Path $DataDir 'server.log'
$StdoutLog = Join-Path $DataDir 'server_stdout.log'
$StderrLog = Join-Path $DataDir 'server_stderr.log'
$DiagnosticLog = Join-Path $DataDir 'startup_diagnostic.log'
$MaintenanceLock = Join-Path $DataDir 'maintenance.lock'
$Port = 5055
if ($env:NUNES_STOCK_PORT -and [int]::TryParse($env:NUNES_STOCK_PORT, [ref]$Port)) { }
$env:NUNES_STOCK_DATA_DIR = $DataDir
$env:NUNES_STOCK_PORT = [string]$Port

New-Item -ItemType Directory -Force -Path $DataDir | Out-Null
$ExpectedVersion = if (Test-Path $VersionFile) { (Get-Content $VersionFile -Raw).Trim() } else { 'unknown' }

# The scheduled 1-minute watchdog calls this script. During an intentional
# installer/GitHub update restart, the maintenance lock prevents the watchdog
# from immediately starting a second server and stealing port 5055.
if ((Test-Path $MaintenanceLock) -and $env:NUNES_STOCK_MAINTENANCE_OWNER -ne '1') {
    $lockAgeMinutes = 0.0
    try { $lockAgeMinutes = ((Get-Date) - (Get-Item $MaintenanceLock).LastWriteTime).TotalMinutes } catch { }
    if ($lockAgeMinutes -lt 15) {
        if (-not $Hidden) {
            Write-Host 'NUNES Stock maintenance/update is currently in progress.' -ForegroundColor Yellow
            Write-Host ("Maintenance lock: {0}" -f $MaintenanceLock) -ForegroundColor DarkYellow
        }
        exit 0
    }
    # Self-heal an abandoned lock after a failed/aborted maintenance session.
    Remove-Item $MaintenanceLock -Force -ErrorAction SilentlyContinue
}

function Write-Diagnostic([string]$Message) {
    $line = ('[{0}] {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Message)
    Add-Content -Path $DiagnosticLog -Value $line -Encoding UTF8
}

function Get-Health {
    try {
        return Invoke-RestMethod -UseBasicParsing -TimeoutSec 3 ("http://127.0.0.1:{0}/api/system/health" -f $Port)
    }
    catch { return $null }
}

function Get-Listener {
    try {
        return Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue | Select-Object -First 1
    }
    catch { return $null }
}

function Get-StaffIp {
    try {
        $route = Get-NetRoute -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue |
            Sort-Object RouteMetric | Select-Object -First 1
        if ($route) {
            return Get-NetIPAddress -InterfaceIndex $route.InterfaceIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue |
                Where-Object { $_.IPAddress -notlike '169.254.*' -and $_.IPAddress -ne '127.0.0.1' } |
                Select-Object -First 1 -ExpandProperty IPAddress
        }
    }
    catch { }
    return $null
}

function Show-OnlineStatus($Health) {
    $listener = Get-Listener
    $pidValue = $null
    if (Test-Path $PidFile) {
        try { $pidValue = [int](Get-Content $PidFile -Raw) } catch { }
    }
    if (-not $pidValue -and $listener) { $pidValue = $listener.OwningProcess }
    $staffIp = Get-StaffIp

    if (-not $Hidden) {
        Write-Host ''
        Write-Host '============================================================' -ForegroundColor Cyan
        Write-Host ' NUNES STOCK SERVER - ONLINE' -ForegroundColor Green
        Write-Host '============================================================' -ForegroundColor Cyan
        Write-Host (" Version    : {0}" -f $ExpectedVersion)
        Write-Host (" Port       : {0}" -f $Port) -ForegroundColor Yellow
        if ($pidValue) { Write-Host (" Process ID : {0}" -f $pidValue) }
        Write-Host (" Owner URL  : http://127.0.0.1:{0}" -f $Port) -ForegroundColor Green
        if ($staffIp) { Write-Host (" Staff URL  : http://{0}:{1}" -f $staffIp, $Port) -ForegroundColor Green }
        else { Write-Host ' Staff URL  : Main server IP could not be detected automatically.' -ForegroundColor Yellow }
        Write-Host (" Data       : {0}" -f $DataDir)
        Write-Host (" Log        : {0}" -f $ServerLog)
        Write-Host '============================================================' -ForegroundColor Cyan
        Write-Host 'This status window may be closed; the server keeps running.' -ForegroundColor DarkCyan
    }
}

function Show-Failure([string]$Reason, $StartedProcess = $null) {
    Write-Diagnostic $Reason
    if (-not $Hidden) {
        Write-Host ''
        Write-Host '============================================================' -ForegroundColor Red
        Write-Host ' NUNES STOCK SERVER - START FAILED' -ForegroundColor Red
        Write-Host '============================================================' -ForegroundColor Red
        Write-Host (" Reason     : {0}" -f $Reason) -ForegroundColor Yellow
        Write-Host (" Version    : {0}" -f $ExpectedVersion)
        Write-Host (" Port       : {0}" -f $Port) -ForegroundColor Yellow
        Write-Host (" Runtime    : {0}" -f $RuntimePython)
        Write-Host (" App folder : {0}" -f $AppDir)
        Write-Host (" Server log : {0}" -f $ServerLog)
        Write-Host (" Error log  : {0}" -f $StderrLog)
        if ($StartedProcess) {
            try { if ($StartedProcess.HasExited) { Write-Host (" Exit code  : {0}" -f $StartedProcess.ExitCode) } } catch { }
        }
        $listener = Get-Listener
        if ($listener) { Write-Host (" Port owner : PID {0}" -f $listener.OwningProcess) }
        foreach ($path in @($StderrLog, $ServerLog, $DiagnosticLog)) {
            if (Test-Path $path) {
                Write-Host ''
                Write-Host ("--- Last lines: {0} ---" -f $path) -ForegroundColor DarkCyan
                Get-Content $path -Tail 30 -ErrorAction SilentlyContinue
            }
        }
        Write-Host '============================================================' -ForegroundColor Red
        Write-Host 'Run SERVER_STATUS.bat after correcting the error.' -ForegroundColor Yellow
    }
}

$health = Get-Health
if ($health -and [string]$health.status -eq 'online') {
    if ([string]$health.version -eq $ExpectedVersion) {
        Show-OnlineStatus $health
        if (-not $Hidden -and -not $StatusOnly) {
            Start-Process explorer.exe ("http://127.0.0.1:{0}/?release={1}" -f $Port, $ExpectedVersion)
        }
        exit 0
    }

    Show-Failure ("Port $Port is already running NUNES Stock version $($health.version), but this launcher expects $ExpectedVersion.")
    exit 2
}

if ($StatusOnly) {
    $listener = Get-Listener
    if ($listener) { Show-Failure ("Port $Port has a listener, but the NUNES health endpoint is not responding.") }
    else { Show-Failure ("No NUNES Stock listener is running on port $Port.") }
    exit 1
}

$listener = Get-Listener
if ($listener) {
    $owner = $null
    try { $owner = Get-CimInstance Win32_Process -Filter ("ProcessId={0}" -f $listener.OwningProcess) -ErrorAction SilentlyContinue } catch { }
    if ($owner -and [string]$owner.CommandLine -match 'server_process\.py') {
        Write-Diagnostic ("Stopping stale NUNES server PID {0} before restart." -f $listener.OwningProcess)
        Stop-Process -Id $listener.OwningProcess -Force -ErrorAction SilentlyContinue
        Start-Sleep -Milliseconds 800
    }
    else {
        Show-Failure ("Port $Port is occupied by another application (PID $($listener.OwningProcess)). NUNES Stock will not terminate an unrelated program.")
        exit 2
    }
}

if (-not (Test-Path $RuntimePython)) {
    Show-Failure 'NUNES Stock Python runtime is missing. Run SETUP_MAIN_SERVER.bat once as Administrator.'
    exit 3
}
if (-not (Test-Path $ServerScript)) {
    Show-Failure ("Server script is missing: $ServerScript")
    exit 4
}

try {
    $runtimeCheck = & $RuntimePython -c "import flask, waitress, pandas, openpyxl, requests; print('runtime-ok')" 2>&1
    if ($LASTEXITCODE -ne 0) { throw ($runtimeCheck | Out-String) }
}
catch {
    Show-Failure ("Python runtime/dependency check failed: {0}" -f $_.Exception.Message)
    exit 5
}

Remove-Item $StdoutLog, $StderrLog -Force -ErrorAction SilentlyContinue
Write-Diagnostic ("Starting version $ExpectedVersion on port $Port")

$process = $null
try {
    $quotedScript = '"' + $ServerScript + '"'
    $process = Start-Process -FilePath $RuntimePython -ArgumentList $quotedScript -WorkingDirectory $AppDir -WindowStyle Hidden -RedirectStandardOutput $StdoutLog -RedirectStandardError $StderrLog -PassThru
}
catch {
    Show-Failure ("Unable to launch Python server process: {0}" -f $_.Exception.Message)
    exit 6
}

$health = $null
for ($attempt = 1; $attempt -le 30; $attempt++) {
    Start-Sleep -Seconds 1
    try { $process.Refresh() } catch { }
    if ($process.HasExited) { break }
    $health = Get-Health
    if ($health -and [string]$health.status -eq 'online' -and [string]$health.version -eq $ExpectedVersion) { break }
}

if (-not $health -or [string]$health.status -ne 'online' -or [string]$health.version -ne $ExpectedVersion) {
    try { if ($process -and -not $process.HasExited) { Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue } } catch { }
    Show-Failure ("Server did not become healthy on port $Port within the startup window.") $process
    exit 7
}

Show-OnlineStatus $health
if (-not $Hidden) {
    Start-Process explorer.exe ("http://127.0.0.1:{0}/?release={1}" -f $Port, $ExpectedVersion)
}
exit 0

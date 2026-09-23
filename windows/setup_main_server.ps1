param()
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$SourceDir = Split-Path -Parent $PSScriptRoot
$InstallRoot = 'C:\NunesStockV31'
$AppDir = Join-Path $InstallRoot 'app'
$DataDir = 'C:\ProgramData\NunesStockV31\data'
$LegacyDataDir = 'C:\ProgramData\NunesStock\data'
$BrandDir = 'C:\ProgramData\NunesStockV31'
$Runtime = Join-Path $env:LOCALAPPDATA 'NunesStockRuntimeV31\venv'
$Python = Join-Path $Runtime 'Scripts\python.exe'
$Port = 5055
$Repo = 'https://github.com/Nunes-instruments/stock_app.git'
$InstallLog = Join-Path $DataDir 'install_v323.log'
$CurrentStep = 'initialization'
$CodeBackup = $null
$PreviousAppWasRunning = $false

function Test-Admin {
    $id = [Security.Principal.WindowsIdentity]::GetCurrent()
    $p = New-Object Security.Principal.WindowsPrincipal($id)
    return $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Log-Line([string]$Text, [string]$Color = 'Gray') {
    $line = ('[{0}] {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Text)
    Write-Host $line -ForegroundColor $Color
    try { Add-Content -Path $InstallLog -Value $line -Encoding UTF8 } catch { }
}

function Step([int]$Number, [int]$Total, [string]$Text) {
    $script:CurrentStep = $Text
    Log-Line (('[{0}/{1}] {2}' -f $Number, $Total, $Text)) 'Cyan'
}

# Native tools such as Git sometimes write normal progress messages to STDERR
# even when they succeed. With ErrorActionPreference=Stop, Windows PowerShell
# can surface those messages as NativeCommandError records. Always judge native
# tools by their EXIT CODE, never by STDERR text.
$script:NativeExitCode = 0
$script:NativeOutput = @()
function Invoke-NativeLogged {
    param(
        [Parameter(Mandatory=$true)][string]$FilePath,
        [string[]]$Arguments = @(),
        [switch]$Quiet
    )

    $previousPreference = $ErrorActionPreference
    $output = @()
    $exitCode = 1
    try {
        $ErrorActionPreference = 'Continue'
        $output = @(& $FilePath @Arguments 2>&1)
        $exitCode = $LASTEXITCODE
        if ($null -eq $exitCode) { $exitCode = 0 }
    }
    finally {
        $ErrorActionPreference = $previousPreference
    }

    $script:NativeExitCode = [int]$exitCode
    $script:NativeOutput = @($output | ForEach-Object { [string]$_ })

    if (-not $Quiet) {
        foreach ($line in $script:NativeOutput) {
            if ([string]::IsNullOrWhiteSpace($line)) { continue }
            Write-Host $line
            try { Add-Content -Path $InstallLog -Value $line -Encoding UTF8 } catch { }
        }
    }

    return $script:NativeExitCode
}

function Get-Health5055 {
    try { return Invoke-RestMethod -UseBasicParsing -TimeoutSec 3 'http://127.0.0.1:5055/api/system/health' } catch { return $null }
}

function Stop-Existing5055 {
    $health = Get-Health5055
    if ($health -and [string]$health.status -eq 'online') {
        $script:PreviousAppWasRunning = $true
    }

    $pidFile = Join-Path $DataDir 'server.pid'
    if (Test-Path $pidFile) {
        $serverPid = 0
        [void][int]::TryParse((Get-Content $pidFile -Raw -ErrorAction SilentlyContinue), [ref]$serverPid)
        if ($serverPid -gt 0) {
            $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$serverPid" -ErrorAction SilentlyContinue
            if ($proc -and [string]$proc.CommandLine -match 'server_process\.py') {
                Log-Line ("Stopping existing NUNES 5055 process PID $serverPid before code replacement...") 'Yellow'
                Stop-Process -Id $serverPid -Force -ErrorAction SilentlyContinue
            }
        }
        Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
    }

    $listeners = @(Get-NetTCPConnection -State Listen -LocalPort 5055 -ErrorAction SilentlyContinue)
    if ($listeners.Count -gt 0) {
        $health = Get-Health5055
        if ($health -and [string]$health.status -eq 'online') {
            foreach ($processId in @($listeners | Select-Object -ExpandProperty OwningProcess -Unique)) {
                $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$processId" -ErrorAction SilentlyContinue
                if ($proc -and [string]$proc.CommandLine -match 'server_process\.py') {
                    Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
                }
            }
        }
        else {
            throw 'Port 5055 is occupied by another application. NUNES Stock will not terminate an unrelated process.'
        }
    }

    for ($i=0; $i -lt 20; $i++) {
        if (@(Get-NetTCPConnection -State Listen -LocalPort 5055 -ErrorAction SilentlyContinue).Count -eq 0) { return }
        Start-Sleep -Milliseconds 250
    }
    throw 'Port 5055 did not become free after stopping the previous NUNES server.'
}

function Start-InstalledServer {
    $startPs = Join-Path $AppDir 'windows\start_main_server.ps1'
    if (-not (Test-Path $startPs)) { throw "Installed server launcher is missing: $startPs" }
    & powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $startPs -Hidden
    if ($LASTEXITCODE -ne 0) { throw "Server start returned error code $LASTEXITCODE." }

    $expected = (Get-Content (Join-Path $AppDir 'VERSION') -Raw).Trim()
    for ($i=0; $i -lt 30; $i++) {
        $h = Get-Health5055
        if ($h -and [string]$h.status -eq 'online' -and [string]$h.version -eq $expected) { return $h }
        Start-Sleep -Seconds 1
    }
    throw "Server did not report expected version $expected on port 5055."
}

function Restore-CodeBackup {
    if (-not $CodeBackup -or -not (Test-Path $CodeBackup)) { return }
    Log-Line 'Restoring previous application code because setup did not complete...' 'Yellow'
    try {
        if (Test-Path $AppDir) { Remove-Item $AppDir -Recurse -Force -ErrorAction SilentlyContinue }
        Move-Item $CodeBackup $AppDir -Force
        $script:CodeBackup = $null
        if ($PreviousAppWasRunning -and (Test-Path (Join-Path $AppDir 'windows\start_main_server.ps1'))) {
            & powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File (Join-Path $AppDir 'windows\start_main_server.ps1') -Hidden | Out-Null
        }
        Log-Line 'Previous application code restored.' 'Green'
    }
    catch {
        Log-Line ("Rollback warning: " + $_.Exception.Message) 'Red'
    }
}

if (-not (Test-Admin)) {
    Write-Host '[FAILED] Administrator permission is required.' -ForegroundColor Red
    Write-Host 'Run RUN_THIS_V3_2_3_UPDATE.bat. It opens a persistent Administrator console.' -ForegroundColor Yellow
    exit 5
}

New-Item -ItemType Directory -Force -Path $InstallRoot,$DataDir,$BrandDir,(Join-Path $DataDir 'db'),(Join-Path $DataDir 'uploads'),(Join-Path $DataDir 'processed'),(Join-Path $DataDir 'exports'),(Join-Path $DataDir 'backups') | Out-Null
"" | Set-Content -Path $InstallLog -Encoding UTF8
$env:NUNES_STOCK_DATA_DIR = $DataDir
$env:NUNES_STOCK_PORT = [string]$Port

Log-Line '============================================================' 'Cyan'
Log-Line ' NUNES STOCK v3.2.12 - PERSISTENT VISIBLE INSTALLER' 'Cyan'
Log-Line ' Port 5055 | Soft Gradient Modern | silent background tasks' 'DarkCyan'
Log-Line '============================================================' 'Cyan'

try {
    Step 1 10 'Checking required Windows tools'
    $systemPython = $null
    if (Get-Command py.exe -ErrorAction SilentlyContinue) { $systemPython = 'py' }
    elseif (Get-Command python.exe -ErrorAction SilentlyContinue) { $systemPython = 'python' }
    else { throw 'Python 3 is required. Install Python 3 and rerun this update.' }
    if (-not (Get-Command git.exe -ErrorAction SilentlyContinue)) { throw 'Git for Windows is required for automatic updates. Install Git and rerun this update.' }
    Log-Line "Python launcher: $systemPython" 'Green'
    Log-Line 'Git for Windows: found' 'Green'

    # Stop legacy recurring console tasks immediately so they cannot flash
    # during the rest of this installation. The hidden replacements are
    # installed later after all checks pass.
    Log-Line 'Disabling old recurring console tasks before continuing...' 'Yellow'
    foreach ($task in @(
        'NUNES Stock Server Watchdog',
        'NUNES Stock Auto Update',
        'NUNES Stock V3 Watchdog 5055',
        'NUNES Stock V3 Auto Update 5055'
    )) {
        # Task-not-found is normal here. Run through cmd so expected stderr
        # cannot become a terminating PowerShell error under Stop mode.
        & cmd.exe /d /c ('schtasks.exe /Delete /F /TN "{0}" >nul 2>&1' -f $task) | Out-Null
    }
    Log-Line 'Old recurring watchdog/updater tasks are disabled.' 'Green'

    Step 2 10 'Protecting existing 5055 stock data'
    $targetMainDb = Join-Path $DataDir 'db\stock.db'
    if (Test-Path $targetMainDb) {
        Log-Line 'Existing v3/5055 database found. It will NOT be replaced from port 5000.' 'Green'
        if ((Test-Path $Python) -and (Test-Path (Join-Path $AppDir 'scripts\backup_data.py'))) {
            Push-Location $AppDir
            try {
                & $Python -m scripts.backup_data 2>&1 | Tee-Object -FilePath $InstallLog -Append
                if ($LASTEXITCODE -ne 0) { throw 'Existing 5055 database backup failed.' }
                Log-Line 'Current 5055 databases backed up before code update.' 'Green'
            }
            finally { Pop-Location }
        }
        else {
            Log-Line 'Runtime backup helper is not available yet; existing database is left untouched.' 'Yellow'
        }
    }
    else {
        if (-not (Test-Path $LegacyDataDir)) { throw 'No existing 5055 database and no port-5000 data source were found.' }
        Log-Line 'First 5055 installation: creating one safe snapshot from current port-5000 data...' 'Yellow'
        $cloneScript = Join-Path $SourceDir 'scripts\clone_live_data.py'
        if ($systemPython -eq 'py') { & py -3 $cloneScript --source $LegacyDataDir --target $DataDir 2>&1 | Tee-Object -FilePath $InstallLog -Append }
        else { & python $cloneScript --source $LegacyDataDir --target $DataDir 2>&1 | Tee-Object -FilePath $InstallLog -Append }
        if ($LASTEXITCODE -ne 0) { throw 'Live-data snapshot failed. No code was replaced.' }
        if (-not (Test-Path $targetMainDb)) { throw 'Data snapshot finished but stock.db was not created in the 5055 data folder.' }
        Log-Line 'Initial 5055 data snapshot completed.' 'Green'
    }

    Step 3 10 'Stopping only the existing NUNES server on port 5055'
    Stop-Existing5055
    Log-Line 'Port 5055 is ready for the new release.' 'Green'

    Step 4 10 'Installing v3.2.12 application code with rollback copy'
    if (Test-Path $AppDir) {
        $stamp = Get-Date -Format 'yyyyMMdd_HHmmss'
        $CodeBackup = Join-Path $InstallRoot ("code_backup_" + $stamp)
        Move-Item $AppDir $CodeBackup
        Log-Line "Previous code backup: $CodeBackup"
    }
    New-Item -ItemType Directory -Force -Path $AppDir | Out-Null
    & robocopy $SourceDir $AppDir /E /R:1 /W:1 /XD '.git' '__pycache__' '.venv' 'venv' 'data' 'backups' /XF '*.db' '*.db-shm' '*.db-wal' 'Master_Stock*.xlsx' '*.log' '*.zip' '*.rar' | Tee-Object -FilePath $InstallLog -Append | Out-Null
    $copyCode = $LASTEXITCODE
    if ($copyCode -gt 7) { throw "Application copy failed with Robocopy code $copyCode." }
    if (-not (Test-Path (Join-Path $AppDir 'VERSION'))) { throw 'Application copy did not create VERSION file.' }
    Log-Line ('Installed code version: ' + (Get-Content (Join-Path $AppDir 'VERSION') -Raw).Trim()) 'Green'

    Step 5 10 'Preparing Python runtime and dependencies'
    if (-not (Test-Path $Python)) {
        Log-Line 'Creating isolated Python runtime. This can take a minute...' 'Yellow'
        New-Item -ItemType Directory -Force -Path (Split-Path $Runtime -Parent) | Out-Null
        if ($systemPython -eq 'py') { & py -3 -m venv $Runtime 2>&1 | Tee-Object -FilePath $InstallLog -Append }
        else { & python -m venv $Runtime 2>&1 | Tee-Object -FilePath $InstallLog -Append }
        if ($LASTEXITCODE -ne 0 -or -not (Test-Path $Python)) { throw 'Unable to create the NUNES Stock Python runtime.' }
    }
    Log-Line 'Installing/checking Python packages. The installer remains open while this runs...' 'Yellow'
    & $Python -m pip install --disable-pip-version-check -r (Join-Path $AppDir 'requirements_portable.txt') 2>&1 | Tee-Object -FilePath $InstallLog -Append
    if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed. See the install log above.' }

    Step 6 10 'Running protected Rack/3D and stock workflow preflight'
    & $Python (Join-Path $AppDir 'scripts\preflight.py') 2>&1 | Tee-Object -FilePath $InstallLog -Append
    if ($LASTEXITCODE -ne 0) { throw 'Production preflight failed. Previous code will be restored.' }
    Log-Line 'Preflight PASS.' 'Green'

    Step 7 10 'Preparing local GitHub update tracking'
    Push-Location $AppDir
    try {
        if (-not (Test-Path (Join-Path $AppDir '.git'))) {
            $rc = Invoke-NativeLogged -FilePath 'git.exe' -Arguments @('init')
            if ($rc -ne 0) { throw 'git init failed.' }
        }

        $rc = Invoke-NativeLogged -FilePath 'git.exe' -Arguments @('config','user.name','Nunes Instruments Stock Server') -Quiet
        if ($rc -ne 0) { throw 'Unable to set local Git user.name.' }
        $rc = Invoke-NativeLogged -FilePath 'git.exe' -Arguments @('config','user.email','stock-server@nunes.local') -Quiet
        if ($rc -ne 0) { throw 'Unable to set local Git user.email.' }
        $rc = Invoke-NativeLogged -FilePath 'git.exe' -Arguments @('config','core.autocrlf','false') -Quiet
        if ($rc -ne 0) { throw 'Unable to set Git line-ending policy.' }

        $rc = Invoke-NativeLogged -FilePath 'git.exe' -Arguments @('remote') -Quiet
        if ($rc -ne 0) { throw 'Unable to read Git remotes.' }
        $remoteNames = @($script:NativeOutput | ForEach-Object { $_.Trim() } | Where-Object { $_ })

        if ($remoteNames -contains 'origin') {
            $rc = Invoke-NativeLogged -FilePath 'git.exe' -Arguments @('remote','get-url','origin') -Quiet
            if ($rc -ne 0) { throw 'Unable to read Git origin URL.' }
            $currentOrigin = ($script:NativeOutput -join "`n").Trim()
            if ($currentOrigin -ne $Repo) {
                Log-Line ("Correcting existing Git origin from '$currentOrigin' to '$Repo'.") 'Yellow'
                $rc = Invoke-NativeLogged -FilePath 'git.exe' -Arguments @('remote','set-url','origin',$Repo)
                if ($rc -ne 0) { throw 'Unable to correct Git origin URL.' }
            }
            else {
                Log-Line 'Existing Git origin is correct.' 'Green'
            }
        }
        else {
            Log-Line 'Git repository has no origin remote. Adding NUNES stock_app origin now...' 'Yellow'
            $rc = Invoke-NativeLogged -FilePath 'git.exe' -Arguments @('remote','add','origin',$Repo)
            if ($rc -ne 0) { throw 'Unable to add Git origin remote.' }
            Log-Line 'Git origin added successfully.' 'Green'
        }

        # Git prints the successful branch switch message to STDERR. That is
        # informational, not an error. Invoke-NativeLogged keeps it visible and
        # uses only Git's exit code to decide success/failure.
        $rc = Invoke-NativeLogged -FilePath 'git.exe' -Arguments @('checkout','-B','nunes-v3-local')
        if ($rc -ne 0) { throw 'Unable to prepare local Git tracking branch.' }
        Log-Line 'Local Git branch nunes-v3-local is ready.' 'Green'

        $rc = Invoke-NativeLogged -FilePath 'git.exe' -Arguments @('add','-A') -Quiet
        if ($rc -ne 0) { throw 'Unable to stage installed application code.' }

        $rc = Invoke-NativeLogged -FilePath 'git.exe' -Arguments @('diff','--cached','--quiet') -Quiet
        if ($rc -eq 1) {
            $rc = Invoke-NativeLogged -FilePath 'git.exe' -Arguments @('commit','-m','NUNES Stock v3.2.12 installed snapshot')
            if ($rc -ne 0) { throw 'Unable to create local installed-code snapshot.' }
        }
        elseif ($rc -gt 1) {
            throw 'Unable to inspect staged Git changes.'
        }
        else {
            $rc = Invoke-NativeLogged -FilePath 'git.exe' -Arguments @('rev-parse','--verify','HEAD') -Quiet
            if ($rc -ne 0 -or -not (($script:NativeOutput -join '').Trim())) {
                $rc = Invoke-NativeLogged -FilePath 'git.exe' -Arguments @('commit','--allow-empty','-m','NUNES Stock v3.2.12 installed snapshot')
                if ($rc -ne 0) { throw 'Unable to create initial local installed-code snapshot.' }
            }
        }

        # Network failure must never block installation. The silent updater
        # will retry every five minutes after setup.
        $rc = Invoke-NativeLogged -FilePath 'git.exe' -Arguments @('fetch','origin','main','--quiet') -Quiet
        if ($rc -eq 0) {
            Log-Line 'GitHub origin/main fetched successfully.' 'Green'
        }
        else {
            Log-Line 'GitHub fetch is unavailable right now. Installation continues; updater will retry later.' 'Yellow'
        }
    }
    finally { Pop-Location }

    Step 8 10 'Installing firewall, desktop shortcuts and true-silent scheduled tasks'
    $rule = Get-NetFirewallRule -DisplayName 'NUNES Stock V3 Server 5055' -ErrorAction SilentlyContinue
    if (-not $rule) { New-NetFirewallRule -DisplayName 'NUNES Stock V3 Server 5055' -Direction Inbound -Protocol TCP -LocalPort 5055 -Action Allow | Out-Null }

    $iconSource = Join-Path $AppDir 'static\NUNES_Stock.ico'
    $iconDest = Join-Path $BrandDir 'NUNES_Stock.ico'
    if (-not (Test-Path $iconSource)) { throw 'NUNES Stock icon is missing from the release.' }
    Copy-Item $iconSource $iconDest -Force
    $desktop = [Environment]::GetFolderPath('Desktop')
    $ws = New-Object -ComObject WScript.Shell
    $open = $ws.CreateShortcut((Join-Path $desktop 'NUNES Stock V3 - Port 5055.lnk'))
    $open.TargetPath = "$env:SystemRoot\explorer.exe"; $open.Arguments = '"http://127.0.0.1:5055"'; $open.WorkingDirectory = $AppDir; $open.IconLocation = "$iconDest,0"; $open.Save()
    $status = $ws.CreateShortcut((Join-Path $desktop 'NUNES Stock V3 - Server Status.lnk'))
    $status.TargetPath = (Join-Path $AppDir 'SERVER_STATUS.bat'); $status.WorkingDirectory = $AppDir; $status.IconLocation = "$iconDest,0"; $status.Save()
    $restart = $ws.CreateShortcut((Join-Path $desktop 'NUNES Stock V3 - Restart Server.lnk'))
    $restart.TargetPath = (Join-Path $AppDir 'RESTART_MAIN_SERVER.bat'); $restart.WorkingDirectory = $AppDir; $restart.IconLocation = "$iconDest,0"; $restart.Save()

    # Remove only old recurring console tasks. The old port-5000 server itself is not killed here.
    & powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File (Join-Path $AppDir 'windows\silent_stop_legacy_periodic_tasks.ps1') | Out-Null

    foreach ($task in @('NUNES Stock V3 Server 5055','NUNES Stock V3 Watchdog 5055','NUNES Stock V3 Auto Update 5055')) {
        & cmd.exe /d /c ('schtasks.exe /Delete /F /TN "{0}" >nul 2>&1' -f $task) | Out-Null
    }
    $watchdog = Join-Path $AppDir 'windows\silent_watchdog.vbs'
    $updater = Join-Path $AppDir 'windows\silent_update.vbs'
    $rc = Invoke-NativeLogged -FilePath 'schtasks.exe' -Arguments @('/Create','/F','/SC','ONLOGON','/TN','NUNES Stock V3 Server 5055','/TR',('wscript.exe "' + $watchdog + '"'),'/RL','HIGHEST')
    if ($rc -ne 0) { throw 'Unable to create the silent startup task.' }
    $rc = Invoke-NativeLogged -FilePath 'schtasks.exe' -Arguments @('/Create','/F','/SC','MINUTE','/MO','1','/TN','NUNES Stock V3 Watchdog 5055','/TR',('wscript.exe "' + $watchdog + '"'),'/RL','HIGHEST')
    if ($rc -ne 0) { throw 'Unable to create the silent watchdog task.' }
    $rc = Invoke-NativeLogged -FilePath 'schtasks.exe' -Arguments @('/Create','/F','/SC','MINUTE','/MO','5','/TN','NUNES Stock V3 Auto Update 5055','/TR',('wscript.exe "' + $updater + '"'),'/RL','HIGHEST')
    if ($rc -ne 0) { throw 'Unable to create the silent GitHub updater task.' }
    Log-Line 'Scheduled background tasks use wscript.exe hidden mode; no recurring terminal should appear.' 'Green'

    Step 9 10 'Starting v3.2.12 main server on port 5055'
    $health = Start-InstalledServer
    Log-Line ("Health check PASS: version $($health.version), port 5055") 'Green'

    Step 10 10 'Final verification and opening dashboard'
    $route = Get-NetRoute -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue | Sort-Object RouteMetric | Select-Object -First 1
    $ip = $null
    if ($route) {
        $ip = Get-NetIPAddress -InterfaceIndex $route.InterfaceIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue |
            Where-Object { $_.IPAddress -notlike '169.254.*' -and $_.IPAddress -ne '127.0.0.1' } |
            Select-Object -First 1 -ExpandProperty IPAddress
    }

    Log-Line '============================================================' 'Green'
    Log-Line ' NUNES STOCK v3.2.12 - INSTALLATION SUCCESS' 'Green'
    Log-Line '============================================================' 'Green'
    Log-Line 'Owner URL : http://127.0.0.1:5055' 'Green'
    if ($ip) { Log-Line ("Staff URL : http://${ip}:5055") 'Green' }
    Log-Line 'Data      : preserved in C:\ProgramData\NunesStockV31\data' 'Green'
    Log-Line 'Watchdog  : silent every 1 minute' 'Green'
    Log-Line 'Git update: silent every 5 minutes' 'Green'
    Log-Line 'Installer : will return to the persistent CMD window; it will not auto-close.' 'Green'

    # Code backup is deliberately kept as a rollback snapshot after a successful update.
    Start-Process explorer.exe 'http://127.0.0.1:5055/?release=3.2.12'
    exit 0
}
catch {
    $message = $_.Exception.Message
    Log-Line '============================================================' 'Red'
    Log-Line (" FAILED AT STEP: $CurrentStep") 'Red'
    Log-Line (" ERROR: $message") 'Red'
    Log-Line '============================================================' 'Red'
    Restore-CodeBackup
    Log-Line "Full installer log: $InstallLog" 'Yellow'
    exit 1
}

param()
$ErrorActionPreference = 'Stop'

function Test-Admin {
    $id = [Security.Principal.WindowsIdentity]::GetCurrent()
    $p = New-Object Security.Principal.WindowsPrincipal($id)
    return $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Test-Admin)) {
    Write-Host 'Administrator permission is required once for main-server setup.' -ForegroundColor Yellow
    Start-Process powershell.exe -Verb RunAs -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',"`"$PSCommandPath`"")
    exit 0
}

$Repo = 'https://github.com/Nunes-instruments/stock_app.git'
$InstallRoot = 'C:\NunesStock'
$AppDir = Join-Path $InstallRoot 'app'
$DataDir = 'C:\ProgramData\NunesStock\data'
$BrandDir = 'C:\ProgramData\NunesStock'
$SourceDir = Split-Path -Parent $PSScriptRoot
$Runtime = Join-Path $env:LOCALAPPDATA 'NunesStockRuntime\venv'
$Python = Join-Path $Runtime 'Scripts\python.exe'

Write-Host '=== NUNES STOCK MAIN SERVER SETUP ===' -ForegroundColor Cyan
New-Item -ItemType Directory -Force -Path $DataDir,$BrandDir,(Join-Path $DataDir 'db'),(Join-Path $DataDir 'uploads'),(Join-Path $DataDir 'processed'),(Join-Path $DataDir 'exports'),(Join-Path $DataDir 'backups') | Out-Null

# Preserve legacy business data BEFORE code is linked to GitHub.
Get-ChildItem -Path $SourceDir -Filter 'stock*.db' -File -ErrorAction SilentlyContinue | ForEach-Object {
    $target = Join-Path (Join-Path $DataDir 'db') $_.Name
    if (-not (Test-Path $target)) { Copy-Item $_.FullName $target; Write-Host "[DATA] Preserved $($_.Name)" }
}
Get-ChildItem -Path $SourceDir -Filter 'Master_Stock*.xlsx' -File -ErrorAction SilentlyContinue | ForEach-Object {
    $target = Join-Path (Join-Path $DataDir 'exports') $_.Name
    if (-not (Test-Path $target)) { Copy-Item $_.FullName $target }
}
foreach($name in @('uploads','processed')) {
    $from = Join-Path $SourceDir $name
    $to = Join-Path $DataDir $name
    if(Test-Path $from){
        Get-ChildItem $from -File | ForEach-Object {
            $target=Join-Path $to $_.Name
            if(-not(Test-Path $target)){Copy-Item $_.FullName $target}
        }
    }
}
$cat = Join-Path $SourceDir 'storage_categories.json'
if((Test-Path $cat) -and -not(Test-Path (Join-Path $DataDir 'storage_categories.json'))){
    Copy-Item $cat (Join-Path $DataDir 'storage_categories.json')
}

if (-not (Get-Command git.exe -ErrorAction SilentlyContinue)) {
    throw 'Git for Windows is required. Install Git, then run SETUP_MAIN_SERVER.bat again.'
}
if (-not (Get-Command py.exe -ErrorAction SilentlyContinue) -and -not (Get-Command python.exe -ErrorAction SilentlyContinue)) {
    throw 'Python 3 is required. Install Python 3, then run setup again.'
}

New-Item -ItemType Directory -Force -Path $InstallRoot | Out-Null
if (Test-Path (Join-Path $AppDir '.git')) {
    Write-Host '[CODE] Existing GitHub app found; updating...'
    git -C $AppDir fetch origin main
    if($LASTEXITCODE -ne 0){ throw 'GitHub fetch failed.' }
    git -C $AppDir reset --hard origin/main
    if($LASTEXITCODE -ne 0){ throw 'GitHub update failed.' }
} elseif (Test-Path $AppDir) {
    throw "Install folder exists but is not a Git repository: $AppDir. Rename/remove that CODE folder only; do not delete $DataDir."
} else {
    Write-Host '[CODE] Cloning NUNES Stock from GitHub...'
    git clone $Repo $AppDir
    if($LASTEXITCODE -ne 0 -or -not (Test-Path (Join-Path $AppDir 'flask_app.py'))){
        throw 'GitHub repository has not been published yet.'
    }
}

if (-not (Test-Path $Python)) {
    New-Item -ItemType Directory -Force -Path (Split-Path $Runtime -Parent) | Out-Null
    if (Get-Command py.exe -ErrorAction SilentlyContinue) { & py -3 -m venv $Runtime } else { & python -m venv $Runtime }
}
& $Python -m pip install --disable-pip-version-check -r (Join-Path $AppDir 'requirements_portable.txt')
if ($LASTEXITCODE -ne 0) { throw 'Python package installation failed.' }

$rule = Get-NetFirewallRule -DisplayName 'NUNES Stock Server 5000' -ErrorAction SilentlyContinue
if(-not $rule){
    New-NetFirewallRule -DisplayName 'NUNES Stock Server 5000' -Direction Inbound -Protocol TCP -LocalPort 5000 -Action Allow | Out-Null
}

# Branded desktop shortcuts.
$iconSource = Join-Path $AppDir 'static\NUNES_Stock.ico'
if(-not(Test-Path $iconSource)){ throw "NUNES Stock icon missing from GitHub app: $iconSource" }
$iconDest = Join-Path $BrandDir 'NUNES_Stock.ico'
Copy-Item $iconSource $iconDest -Force

$desktop = [Environment]::GetFolderPath('Desktop')
@('NUNES Stock - Owner.lnk','NUNES Stock - Owner.url','NUNES Stock.url','NUNES Stock.lnk') | ForEach-Object {
    $old=Join-Path $desktop $_
    if(Test-Path $old){Remove-Item $old -Force}
}

$ws = New-Object -ComObject WScript.Shell

$open = $ws.CreateShortcut((Join-Path $desktop 'NUNES Stock.lnk'))
$open.TargetPath = "$env:SystemRoot\explorer.exe"
$open.Arguments = '"http://127.0.0.1:5000"'
$open.WorkingDirectory = $AppDir
$open.IconLocation = "$iconDest,0"
$open.Description = 'Open NUNES Stock on the main server'
$open.Save()

$update = $ws.CreateShortcut((Join-Path $desktop 'NUNES Stock - Update Server.lnk'))
$update.TargetPath = (Join-Path $AppDir 'UPDATE_MAIN_SERVER.bat')
$update.WorkingDirectory = $AppDir
$update.IconLocation = "$iconDest,0"
$update.Description = 'Backup data, pull latest code from GitHub, and restart NUNES Stock'
$update.Save()

# Auto-start server on logon and check GitHub every 15 minutes.
$startBat = Join-Path $AppDir 'START_MAIN_SERVER.bat'
$updateBat = Join-Path $AppDir 'AUTO_UPDATE_MAIN_SERVER.bat'
schtasks /Create /F /SC ONLOGON /TN 'NUNES Stock Server' /TR "`"$startBat`" --hidden" /RL HIGHEST | Out-Null
schtasks /Create /F /SC MINUTE /MO 15 /TN 'NUNES Stock Auto Update' /TR "`"$updateBat`"" /RL HIGHEST | Out-Null

& $startBat

$route = Get-NetRoute -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue | Sort-Object RouteMetric | Select-Object -First 1
$ip = $null
if($route){
    $ip = Get-NetIPAddress -InterfaceIndex $route.InterfaceIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue |
        Where-Object {$_.IPAddress -notlike '169.254.*'} |
        Select-Object -First 1 -ExpandProperty IPAddress
}

Write-Host ''
Write-Host '[OK] Main server setup complete.' -ForegroundColor Green
Write-Host '[OK] Branded desktop icon created: NUNES Stock' -ForegroundColor Green
Write-Host 'Owner URL: http://127.0.0.1:5000'
if($ip){ Write-Host "Staff URL: http://${ip}:5000" -ForegroundColor Green }
Write-Host "Live data: $DataDir"
Write-Host "GitHub code: $AppDir"
Write-Host 'Future GitHub code updates will not overwrite the live stock database.'

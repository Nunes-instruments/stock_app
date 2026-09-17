param([ValidateSet('Staff','Owner')][string]$Role='Staff')
$ErrorActionPreference = 'Stop'

Write-Host "=== NUNES STOCK - $Role PC SETUP ===" -ForegroundColor Cyan

$sourceRoot = Split-Path -Parent $PSScriptRoot
$iconSource = Join-Path $sourceRoot 'static\NUNES_Stock.ico'
if(-not (Test-Path $iconSource)){ throw "NUNES Stock icon is missing: $iconSource" }

$server = Read-Host 'Enter MAIN SERVER IP or hostname (example 192.168.29.31)'
$server = $server.Trim()
if(-not $server){ throw 'Server address cannot be blank.' }

if($server -match '^https?://'){
    $url = $server.TrimEnd('/')
} else {
    $url = "http://${server}:5000"
}

try {
    Invoke-WebRequest -Uri "$url/api/system/health" -UseBasicParsing -TimeoutSec 5 | Out-Null
    Write-Host '[OK] Main server is reachable.' -ForegroundColor Green
} catch {
    Write-Host '[WARNING] Server is not reachable right now. Shortcut will still be created.' -ForegroundColor Yellow
}

$configDir = Join-Path $env:LOCALAPPDATA 'NunesStockClient'
New-Item -ItemType Directory -Force -Path $configDir | Out-Null

$iconDest = Join-Path $configDir 'NUNES_Stock.ico'
Copy-Item -Path $iconSource -Destination $iconDest -Force

@{
    role = $Role
    server_url = $url
    configured_at = (Get-Date).ToString('s')
} | ConvertTo-Json | Set-Content (Join-Path $configDir 'client.json') -Encoding UTF8

$desktop = [Environment]::GetFolderPath('Desktop')

# Remove only old NUNES Stock shortcut files; never touch business data.
@(
    'NUNES Stock - Staff.url',
    'NUNES Stock - Owner.url',
    'NUNES Stock - Staff.lnk',
    'NUNES Stock - Owner.lnk',
    'NUNES Stock.lnk'
) | ForEach-Object {
    $old = Join-Path $desktop $_
    if(Test-Path $old){ Remove-Item $old -Force }
}

$ws = New-Object -ComObject WScript.Shell
$shortcutPath = Join-Path $desktop 'NUNES Stock.lnk'
$shortcut = $ws.CreateShortcut($shortcutPath)
$shortcut.TargetPath = "$env:SystemRoot\explorer.exe"
$shortcut.Arguments = "`"$url`""
$shortcut.WorkingDirectory = $configDir
$shortcut.IconLocation = "$iconDest,0"
$shortcut.Description = "Open NUNES Stock ($Role) from the main server"
$shortcut.Save()

Write-Host '[OK] Branded desktop app icon created: NUNES Stock' -ForegroundColor Green
Write-Host "Role: $Role"
Write-Host "Server URL: $url"
Start-Process $url

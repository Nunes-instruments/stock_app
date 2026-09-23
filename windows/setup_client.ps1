param([ValidateSet('Staff','Owner')][string]$Role='Staff')
$ErrorActionPreference = 'Stop'

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " NUNES STOCK v3.2.12 - $Role DESKTOP SETUP" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "This PC will NOT install the stock application or database."
Write-Host "It opens the central main server directly on port 5055."
Write-Host "Future server releases are therefore available automatically."
Write-Host "============================================================" -ForegroundColor Cyan

$sourceRoot = Split-Path -Parent $PSScriptRoot
$iconSource = Join-Path $sourceRoot 'static\NUNES_Stock.ico'
if(-not (Test-Path $iconSource)){ throw "NUNES Stock icon is missing: $iconSource" }

$server = Read-Host 'Enter MAIN SERVER IP or hostname (example 192.168.29.31)'
$server = $server.Trim()
if(-not $server){ throw 'Server address cannot be blank.' }

if($server -match '^https?://'){
    $url = $server.TrimEnd('/')
    # When a bare http(s) URL has no explicit port, keep what the user supplied.
} else {
    $url = "http://${server}:5055"
}

$health = $null
try {
    $health = Invoke-RestMethod -Uri "$url/api/system/health" -UseBasicParsing -TimeoutSec 5
    if([string]$health.status -ne 'online'){ throw 'Health endpoint did not report online.' }
    Write-Host ("[OK] Main server reachable. Version: {0}" -f $health.version) -ForegroundColor Green
} catch {
    Write-Host '[WARNING] Main server is not reachable right now.' -ForegroundColor Yellow
    Write-Host 'The desktop shortcut will still be created; it will work when the server/network is available.' -ForegroundColor Yellow
}

$configDir = Join-Path $env:LOCALAPPDATA 'NunesStockClient'
New-Item -ItemType Directory -Force -Path $configDir | Out-Null
$iconDest = Join-Path $configDir 'NUNES_Stock.ico'
Copy-Item -Path $iconSource -Destination $iconDest -Force

@{
    role = $Role
    server_url = $url
    configured_at = (Get-Date).ToString('s')
    architecture = 'central-browser-client'
    local_application = $false
} | ConvertTo-Json | Set-Content (Join-Path $configDir 'client.json') -Encoding UTF8

# Prefer browser app-mode so NUNES Stock feels like a desktop application.
$browser = $null
$browserArguments = $null
$edgeCandidates = @(
    "$env:ProgramFiles(x86)\Microsoft\Edge\Application\msedge.exe",
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
)
$chromeCandidates = @(
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "$env:ProgramFiles(x86)\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
)
foreach($candidate in @($edgeCandidates + $chromeCandidates)){
    if($candidate -and (Test-Path $candidate)){
        $browser = $candidate
        $browserArguments = "--app=`"$url`" --start-maximized"
        break
    }
}
if(-not $browser){
    $browser = "$env:SystemRoot\explorer.exe"
    $browserArguments = "`"$url`""
}

$desktop = [Environment]::GetFolderPath('Desktop')
$shortcutName = if($Role -eq 'Owner'){ 'NUNES Stock - Owner.lnk' } else { 'NUNES Stock - Staff.lnk' }
$shortcutPath = Join-Path $desktop $shortcutName

# Remove older NUNES Stock client shortcuts only. Never touch business data.
@(
    'NUNES Stock V3.lnk',
    'NUNES Stock - Staff.url',
    'NUNES Stock - Owner.url',
    $shortcutName
) | ForEach-Object {
    $old = Join-Path $desktop $_
    if(Test-Path $old){ Remove-Item $old -Force -ErrorAction SilentlyContinue }
}

$ws = New-Object -ComObject WScript.Shell
$shortcut = $ws.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $browser
$shortcut.Arguments = $browserArguments
$shortcut.WorkingDirectory = $configDir
$shortcut.IconLocation = "$iconDest,0"
$shortcut.Description = "NUNES Stock $Role - live central server"
$shortcut.Save()

Write-Host "[OK] Desktop shortcut created: $shortcutName" -ForegroundColor Green
Write-Host "Server URL : $url"
Write-Host "Role       : $Role"
Write-Host "Updates    : Automatic from the main server; no local app update required." -ForegroundColor Green
Write-Host "Live sync  : Browser checks the server every 5 seconds." -ForegroundColor Green

Start-Process -FilePath $browser -ArgumentList $browserArguments

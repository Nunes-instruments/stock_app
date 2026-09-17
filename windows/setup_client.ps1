param([ValidateSet('Staff','Owner')][string]$Role='Staff')
$ErrorActionPreference = 'Stop'
Write-Host "=== NUNES STOCK - $Role PC SETUP ===" -ForegroundColor Cyan
$server = Read-Host 'Enter MAIN SERVER IP or hostname (example 192.168.29.31)'
$server = $server.Trim()
if(-not $server){ throw 'Server address cannot be blank.' }
if($server -match '^https?://'){ $url=$server.TrimEnd('/') } else { $url="http://${server}:5000" }

try { Invoke-WebRequest -Uri "$url/api/system/health" -UseBasicParsing -TimeoutSec 5 | Out-Null; Write-Host '[OK] Main server is reachable.' -ForegroundColor Green }
catch { Write-Host '[WARNING] Server is not reachable right now. Shortcut will still be created.' -ForegroundColor Yellow }

$desktop=[Environment]::GetFolderPath('Desktop')
$path=Join-Path $desktop "NUNES Stock - $Role.url"
@"
[InternetShortcut]
URL=$url
IconFile=%SystemRoot%\System32\shell32.dll
IconIndex=13
"@ | Set-Content -Path $path -Encoding ASCII

$configDir=Join-Path $env:LOCALAPPDATA 'NunesStockClient'
New-Item -ItemType Directory -Force -Path $configDir | Out-Null
@{ role=$Role; server_url=$url; configured_at=(Get-Date).ToString('s') } | ConvertTo-Json | Set-Content (Join-Path $configDir 'client.json') -Encoding UTF8
Write-Host "[OK] Desktop icon created: NUNES Stock - $Role"
Write-Host "Server URL: $url"
Start-Process $url

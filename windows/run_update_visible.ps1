param([switch]$Elevated)
$ErrorActionPreference = 'Stop'

function Test-Admin {
    $id = [Security.Principal.WindowsIdentity]::GetCurrent()
    $p = New-Object Security.Principal.WindowsPrincipal($id)
    return $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Hold-Window([int]$Code) {
    Write-Host ''
    Write-Host '============================================================' -ForegroundColor Cyan
    if ($Code -eq 0) {
        Write-Host ' UPDATE PROCESS FINISHED - SUCCESS' -ForegroundColor Green
        Write-Host ' Open: http://127.0.0.1:5055' -ForegroundColor Green
    }
    else {
        Write-Host (" UPDATE PROCESS STOPPED - ERROR CODE $Code") -ForegroundColor Red
        Write-Host ' The error above has been left on screen intentionally.' -ForegroundColor Yellow
        Write-Host ' Log: C:\ProgramData\NunesStockV31\data\install_v323.log' -ForegroundColor Yellow
    }
    Write-Host '============================================================' -ForegroundColor Cyan
    Write-Host ''
    [void](Read-Host 'Press ENTER only after you have finished reading this window')
}

if (-not (Test-Admin)) {
    Write-Host 'Administrator permission is required. Opening a persistent Administrator window...' -ForegroundColor Yellow
    try {
        $argList = @(
            '-NoLogo',
            '-NoProfile',
            '-NoExit',
            '-ExecutionPolicy', 'Bypass',
            '-File', ('"' + $PSCommandPath + '"'),
            '-Elevated'
        )
        $process = Start-Process -FilePath 'powershell.exe' -Verb RunAs -ArgumentList $argList -PassThru -Wait
        exit $process.ExitCode
    }
    catch {
        Write-Host ('Unable to open Administrator window: ' + $_.Exception.Message) -ForegroundColor Red
        Write-Host 'Right-click RUN_THIS_V3_2_3_UPDATE.bat and choose Run as administrator.' -ForegroundColor Yellow
        [void](Read-Host 'Press ENTER to close')
        exit 5
    }
}

Clear-Host
Write-Host '============================================================' -ForegroundColor Cyan
Write-Host ' NUNES STOCK v3.2.12 - PERSISTENT VISIBLE UPDATE' -ForegroundColor Cyan
Write-Host '============================================================' -ForegroundColor Cyan
Write-Host 'Port        : 5055'
Write-Host 'UI          : Concept 3 - Soft Gradient Modern'
Write-Host 'Data        : Existing 5055 stock data preserved'
Write-Host 'Rack / 3D   : Protected and unchanged'
Write-Host 'Watchdog    : Hidden background task'
Write-Host 'Git updater : Hidden background task'
Write-Host 'Window      : Will stay open until YOU press ENTER' -ForegroundColor Green
Write-Host '============================================================' -ForegroundColor Cyan
Write-Host ''

$setup = Join-Path $PSScriptRoot 'setup_main_server.ps1'
$rc = 1
try {
    & $setup
    $rc = $LASTEXITCODE
    if ($null -eq $rc) { $rc = 0 }
}
catch {
    Write-Host ''
    Write-Host ('[LAUNCHER ERROR] ' + $_.Exception.Message) -ForegroundColor Red
    $rc = 1
}

Hold-Window $rc
exit $rc

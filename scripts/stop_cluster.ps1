<#
.SYNOPSIS
    Safely stops only the processes launched by start_cluster.ps1 using data/cluster_pids.json.
#>

$RootDir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$PidFile = Join-Path $RootDir "data\cluster_pids.json"

if (-not (Test-Path $PidFile)) {
    Write-Host "No cluster_pids.json found. Nothing to stop." -ForegroundColor Yellow
    exit 0
}

$entries = Get-Content $PidFile -Raw | ConvertFrom-Json
foreach ($entry in $entries) {
    $proc = Get-Process -Id $entry.pid -ErrorAction SilentlyContinue
    if ($proc) {
        Write-Host "Stopping $($entry.name) (PID $($entry.pid))..." -ForegroundColor Cyan
        Stop-Process -Id $entry.pid -Force -ErrorAction SilentlyContinue
    } else {
        Write-Host "$($entry.name) (PID $($entry.pid)) already stopped." -ForegroundColor DarkGray
    }
}

Remove-Item $PidFile -ErrorAction SilentlyContinue
Write-Host "Cluster shutdown complete." -ForegroundColor Green

<#
.SYNOPSIS
    Starts the Distributed File System (Master Node, 3 Storage Nodes, and Frontend) in separate PowerShell windows.
#>

$ErrorActionPreference = "Stop"
$RootDir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$VenvPython = Join-Path $RootDir ".venv\Scripts\python.exe"
$DataDir = Join-Path $RootDir "data"
$PidFile = Join-Path $DataDir "cluster_pids.json"

if (-not (Test-Path $VenvPython)) {
    Write-Error "Virtual environment not found at $VenvPython. Create it with: py -m venv .venv"
}

if (-not (Test-Path (Join-Path $RootDir "frontend\node_modules"))) {
    Write-Error "Frontend dependencies not installed. Run: cd frontend; npm install"
}

New-Item -ItemType Directory -Force -Path $DataDir | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $RootDir "storage\node1") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $RootDir "storage\node2") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $RootDir "storage\node3") | Out-Null

$procs = @()

Write-Host "Starting Master Node on http://127.0.0.1:8000 ..." -ForegroundColor Cyan
$masterCmd = "Set-Location '$RootDir'; `$host.UI.RawUI.WindowTitle = 'DFS Master Node (:8000)'; & '$VenvPython' -m uvicorn master.app:app --host 127.0.0.1 --port 8000"
$pMaster = Start-Process powershell -ArgumentList "-NoExit", "-Command", $masterCmd -PassThru
$procs += @{ name = "master"; pid = $pMaster.Id; port = 8000 }

Start-Sleep -Seconds 2

$nodes = @(
    @{ id = "node-1"; name = "Storage Node 1"; port = 8001; dir = "storage/node1" },
    @{ id = "node-2"; name = "Storage Node 2"; port = 8002; dir = "storage/node2" },
    @{ id = "node-3"; name = "Storage Node 3"; port = 8003; dir = "storage/node3" }
)

foreach ($n in $nodes) {
    Write-Host "Starting $($n.name) on http://127.0.0.1:$($n.port) ..." -ForegroundColor Green
    $nodeCmd = @(
        "Set-Location '$RootDir'",
        "`$host.UI.RawUI.WindowTitle = 'DFS $($n.name) (:$($n.port))'",
        "`$env:NODE_ID = '$($n.id)'",
        "`$env:NODE_NAME = '$($n.name)'",
        "`$env:NODE_HOST = '127.0.0.1'",
        "`$env:NODE_PORT = '$($n.port)'",
        "`$env:STORAGE_DIR = '$($n.dir)'",
        "`$env:MASTER_URL = 'http://127.0.0.1:8000'",
        "`$env:AUTO_REGISTER = 'true'",
        "& '$VenvPython' -m uvicorn storage_node.app:app --host 127.0.0.1 --port $($n.port)"
    ) -join "; "
    $pNode = Start-Process powershell -ArgumentList "-NoExit", "-Command", $nodeCmd -PassThru
    $procs += @{ name = $n.id; pid = $pNode.Id; port = $n.port }
}

Write-Host "Starting Frontend Dashboard on http://127.0.0.1:5173 ..." -ForegroundColor Magenta
$feDir = Join-Path $RootDir "frontend"
$feCmd = "Set-Location '$feDir'; `$host.UI.RawUI.WindowTitle = 'DFS Frontend (:5173)'; npm run dev"
$pFe = Start-Process powershell -ArgumentList "-NoExit", "-Command", $feCmd -PassThru
$procs += @{ name = "frontend"; pid = $pFe.Id; port = 5173 }

$procs | ConvertTo-Json | Set-Content -Path $PidFile -Encoding UTF8

Write-Host ""
Write-Host "Cluster started! Dashboard: http://127.0.0.1:5173 | Master API Docs: http://127.0.0.1:8000/docs" -ForegroundColor Yellow
Write-Host "To stop all launched windows cleanly, run: .\scripts\stop_cluster.ps1" -ForegroundColor Yellow

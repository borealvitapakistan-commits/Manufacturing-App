$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$pidDir = Join-Path $root ".dev-pids"
New-Item -ItemType Directory -Path $pidDir -Force | Out-Null

function Test-Port([int]$Port) {
    return [bool](Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue)
}

if (-not (Test-Port 8000)) {
    $backend = Start-Process `
        -FilePath (Join-Path $root "backend\.venv\Scripts\python.exe") `
        -ArgumentList @("manage.py", "runserver", "127.0.0.1:8000", "--noreload", "--nothreading") `
        -WorkingDirectory (Join-Path $root "backend") `
        -RedirectStandardOutput (Join-Path $root "backend\django-dev.stdout.log") `
        -RedirectStandardError (Join-Path $root "backend\django-dev.stderr.log") `
        -PassThru `
        -WindowStyle Hidden
    Set-Content -LiteralPath (Join-Path $pidDir "backend.pid") -Value $backend.Id
}

if (-not (Test-Port 5173)) {
    $frontend = Start-Process `
        -FilePath "C:\Program Files\nodejs\npm.cmd" `
        -ArgumentList @("run", "dev", "--", "--host", "127.0.0.1", "--port", "5173") `
        -WorkingDirectory (Join-Path $root "frontend") `
        -RedirectStandardOutput (Join-Path $root "frontend\vite-dev.stdout.log") `
        -RedirectStandardError (Join-Path $root "frontend\vite-dev.stderr.log") `
        -PassThru `
        -WindowStyle Hidden
    Set-Content -LiteralPath (Join-Path $pidDir "frontend.pid") -Value $frontend.Id
}

Start-Sleep -Seconds 4
$health = Invoke-RestMethod -Uri "http://127.0.0.1:8000/api/health/" -TimeoutSec 20
if (-not $health.ok -or -not $health.supabaseConnected) {
    throw "Django started, but Supabase is not connected."
}

Write-Host "Manufacturing app is ready:"
Write-Host "Frontend: http://127.0.0.1:5173"
Write-Host "Backend:  http://127.0.0.1:8000/api"

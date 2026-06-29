$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$pidDir = Join-Path $root ".dev-pids"

foreach ($name in @("backend", "frontend")) {
    $pidFile = Join-Path $pidDir "$name.pid"
    if (-not (Test-Path -LiteralPath $pidFile)) {
        continue
    }
    $processId = [int](Get-Content -LiteralPath $pidFile)
    $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
    if ($process) {
        Stop-Process -Id $processId
    }
    Remove-Item -LiteralPath $pidFile -Force
}

Write-Host "Manufacturing development processes stopped."

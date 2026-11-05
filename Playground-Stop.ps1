$ErrorActionPreference = 'Stop'
$Root = $PSScriptRoot
$PidFile = Join-Path $Root 'playground.pid'

function Stop-Tree([int]$ProcessId) {
    try {
        & taskkill.exe /PID $ProcessId /T /F 2>$null | Out-Null
    } catch { }
}

$stopped = $false
if (Test-Path -LiteralPath $PidFile) {
    $raw = (Get-Content -LiteralPath $PidFile -Raw).Trim()
    if ($raw -match '^\d+$') {
        $procId = [int]$raw
        if (Get-Process -Id $procId -ErrorAction SilentlyContinue) {
            Write-Host "Stopping PID $procId ..."
            Stop-Tree $procId
            $stopped = $true
        }
    }
    Remove-Item -LiteralPath $PidFile -Force -ErrorAction SilentlyContinue
}

# Fallback: kill node main.js whose cwd looks like this package
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | ForEach-Object {
    if ($_.CommandLine -and $_.CommandLine -match 'main\.js' -and $_.CommandLine -match [regex]::Escape($Root)) {
        Write-Host "Stopping leftover node PID $($_.ProcessId)"
        Stop-Tree ([int]$_.ProcessId)
        $stopped = $true
    }
}

if ($stopped) { Write-Host 'Stopped.' } else { Write-Host 'No running Playground package process found.' }

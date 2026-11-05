# Start Playground folder package (no Docker).
$ErrorActionPreference = 'Stop'
$Root = $PSScriptRoot
$AppDir = Join-Path $Root 'app'
$NodeDir = Join-Path $Root 'node'
$CamoufoxExe = Join-Path $Root 'camoufox\camoufox.exe'
$PidFile = Join-Path $Root 'playground.pid'
$OutLog = Join-Path $Root 'playground.out.log'
$ErrLog = Join-Path $Root 'playground.err.log'
$EnvFile = Join-Path $AppDir '.env'

function Read-EnvPort {
    $port = 8020
    if (Test-Path -LiteralPath $EnvFile) {
        $line = Get-Content -LiteralPath $EnvFile | Where-Object { $_ -match '^\s*PORT\s*=' } | Select-Object -First 1
        if ($line -match 'PORT\s*=\s*(\d+)') { $port = [int]$Matches[1] }
    }
    return $port
}

function Test-PortFree([int]$Port) {
    try {
        $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
        $listener.Start()
        $listener.Stop()
        return $true
    } catch {
        return $false
    }
}

if (-not (Test-Path -LiteralPath (Join-Path $AppDir 'main.js'))) {
    throw "app\main.js not found under $Root. Run Build-PlaygroundWin64.ps1 first."
}
if (-not (Test-Path -LiteralPath $CamoufoxExe)) {
    throw "camoufox\camoufox.exe not found. Run Build-PlaygroundWin64.ps1 first."
}

$nodeExe = Join-Path $NodeDir 'node.exe'
if (-not (Test-Path -LiteralPath $nodeExe)) {
    $sys = Get-Command node.exe -ErrorAction SilentlyContinue
    if (-not $sys) { throw 'Portable node.exe missing and system Node not found.' }
    $nodeExe = $sys.Source
}

if (-not (Test-Path -LiteralPath $EnvFile)) {
    Copy-Item -LiteralPath (Join-Path $Root '.env.native.example') -Destination $EnvFile -Force
}

# BrowserManager resolves relative camoufox under cwd; also set absolute override.
$env:CAMOUFOX_EXECUTABLE_PATH = $CamoufoxExe
$env:NODE_ENV = 'production'

$port = Read-EnvPort
if (-not (Test-PortFree $port)) {
    Write-Host "Port $port is busy. Stop Docker 8020 or the other native instance, or change PORT in app\.env"
    throw "Port $port in use"
}

if (Test-Path -LiteralPath $PidFile) {
    $raw = (Get-Content -LiteralPath $PidFile -Raw).Trim()
    if ($raw -match '^\d+$') {
        $oldPid = [int]$raw
        if (Get-Process -Id $oldPid -ErrorAction SilentlyContinue) {
            Write-Host "Playground already running (PID $oldPid)."
            Write-Host "  URL: http://127.0.0.1:$port"
            Start-Process "http://127.0.0.1:$port"
            return
        }
    }
}

Write-Host "Starting Playground on http://127.0.0.1:$port ..."
if (Test-Path -LiteralPath $OutLog) { Remove-Item -LiteralPath $OutLog -Force }
if (Test-Path -LiteralPath $ErrLog) { Remove-Item -LiteralPath $ErrLog -Force }

$proc = Start-Process -FilePath $nodeExe -ArgumentList 'main.js' -WorkingDirectory $AppDir `
    -PassThru -WindowStyle Minimized `
    -RedirectStandardOutput $OutLog -RedirectStandardError $ErrLog

Set-Content -LiteralPath $PidFile -Value $proc.Id -Encoding ASCII

$healthUrl = "http://127.0.0.1:$port/health"
$deadline = (Get-Date).AddSeconds(90)
$ok = $false
Add-Type -AssemblyName System.Net.Http
do {
    Start-Sleep -Seconds 2
    if ($proc.HasExited) {
        Write-Host "---- stdout ----"
        if (Test-Path $OutLog) { Get-Content $OutLog -Tail 40 }
        Write-Host "---- stderr ----"
        if (Test-Path $ErrLog) { Get-Content $ErrLog -Tail 40 }
        throw "Playground exited early with code $($proc.ExitCode)."
    }
    try {
        $handler = New-Object System.Net.Http.HttpClientHandler
        $handler.UseProxy = $false
        $client = New-Object System.Net.Http.HttpClient($handler)
        $client.Timeout = [TimeSpan]::FromSeconds(3)
        $resp = $client.GetAsync($healthUrl).GetAwaiter().GetResult()
        if ($resp.IsSuccessStatusCode) {
            $body = $resp.Content.ReadAsStringAsync().GetAwaiter().GetResult()
            if ($body -match '"status"\s*:\s*"ok"') { $ok = $true }
        }
        $resp.Dispose(); $client.Dispose(); $handler.Dispose()
    } catch { }
} while (-not $ok -and (Get-Date) -lt $deadline)

if ($ok) {
    Write-Host "Playground is up."
} else {
    Write-Host "Process started (PID $($proc.Id)) but /health not ok within 90s. See playground.out.log"
}
Write-Host "  URL: http://127.0.0.1:$port"
Write-Host "  Key: pg123456 (or API_KEYS in app\.env)"
Write-Host "  PID: $($proc.Id)"
Start-Process "http://127.0.0.1:$port"

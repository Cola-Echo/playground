# Launch headed Camoufox login and save auth into package auth dir.
$ErrorActionPreference = 'Stop'
$Root = $PSScriptRoot
$AppDir = Join-Path $Root 'app'
$NodeDir = Join-Path $Root 'node'
$CamoufoxExe = Join-Path $Root 'camoufox\camoufox.exe'

$nodeExe = Join-Path $NodeDir 'node.exe'
if (-not (Test-Path -LiteralPath $nodeExe)) {
    $sys = Get-Command node.exe -ErrorAction SilentlyContinue
    if (-not $sys) { throw 'node.exe not found' }
    $nodeExe = $sys.Source
}
if (-not (Test-Path -LiteralPath (Join-Path $AppDir 'scripts\auth\setupAuth.js'))) {
    throw 'scripts\auth\setupAuth.js missing inside app\'
}

$env:NODE_ENV = 'production'
if (Test-Path -LiteralPath $CamoufoxExe) {
    $env:CAMOUFOX_EXECUTABLE_PATH = $CamoufoxExe
}

# setupAuth downloads into project root (app\) and writes configs/auth
Set-Location -LiteralPath $AppDir
Write-Host 'Opening auth setup. Log in with Google in the Camoufox window, then return here.'
& $nodeExe 'scripts\auth\setupAuth.js' @args
exit $LASTEXITCODE

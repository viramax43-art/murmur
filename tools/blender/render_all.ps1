# Renders every cutscene to assets/cutscenes/ at 1600x900.
# Finds Blender on the PATH, or set BLENDER="C:\path\to\blender.exe".
# Usage: npm run cutscenes

$ErrorActionPreference = 'Stop'

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Split-Path -Parent (Split-Path -Parent $here)

$blender = $env:BLENDER
if (-not $blender) {
    $candidates = @(
        'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe',
        'C:\Program Files\Blender Foundation\Blender 5.1\blender.exe',
        'C:\Program Files\Blender Foundation\Blender 5.0\blender.exe',
        'C:\Program Files\Blender Foundation\Blender 4.5\blender.exe'
    )
    $blender = $candidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
}
if (-not $blender) {
    throw 'Blender not found. Set $env:BLENDER to blender.exe and run again.'
}

& powershell -ExecutionPolicy Bypass -File (Join-Path $here 'fetch_assets.ps1')

Write-Host "rendering with $blender"
& $blender -b -P (Join-Path $here 'build.py') -- --scene all --res 1600x900
if ($LASTEXITCODE -ne 0) { throw "Blender exited with $LASTEXITCODE" }

Write-Host "done: $root\assets\cutscenes"

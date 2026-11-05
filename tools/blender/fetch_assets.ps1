# Downloads the official Blender human base meshes (~50 MB) into
# tools/blender/cache/. The Blender pipeline needs it; nothing else does.
# Usage: powershell -ExecutionPolicy Bypass -File tools/blender/fetch_assets.ps1

$ErrorActionPreference = 'Stop'

$url = 'https://download.blender.org/demo/asset-bundles/human-base-meshes/human-base-meshes-bundle-v1.4.1.zip'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$cache = Join-Path $here 'cache'
$zip = Join-Path $cache 'humans.zip'
$blend = Join-Path $cache 'human_base_meshes_bundle.blend'

New-Item -ItemType Directory -Force -Path $cache | Out-Null

if (Test-Path -LiteralPath $blend) {
    Write-Host "already have $blend"
    exit 0
}

Write-Host "downloading human base meshes (~50 MB)..."
Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing

Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::OpenRead((Resolve-Path $zip))
try {
    $entry = $archive.Entries | Where-Object { $_.FullName -like '*.blend' } | Select-Object -First 1
    [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $blend, $true)
}
finally {
    $archive.Dispose()
}

Remove-Item -LiteralPath $zip -Force
Write-Host "ready: $blend"
Write-Host "render a shot: blender -b -P tools/blender/build.py -- --scene ch1-in"

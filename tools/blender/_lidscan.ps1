param([string]$Name = 'face-female-front_lid2.png')
Add-Type -AssemblyName System.Drawing
$src = Join-Path $PSScriptRoot "out\face\$Name"
$img = [System.Drawing.Image]::FromFile($src)
$bmp = New-Object System.Drawing.Bitmap($img)
$w = $bmp.Width; $h = $bmp.Height
# zoom 4.0 frames 0.055 m across, so px per mm follows from the width
$mm = 0.055
$pxmm = $w / ($mm * 1000.0)
"size $w x $h  px/mm {0:N3}" -f $pxmm
$white = @(); $iris = @(); $dark = @()
for ($y = 0; $y -lt $h; $y += 1) {
  for ($x = 0; $x -lt $w; $x += 1) {
    $p = $bmp.GetPixel($x, $y)
    $r = $p.R / 255.0; $g = $p.G / 255.0; $b = $p.B / 255.0
    $lo = [Math]::Min($r, [Math]::Min($g, $b)); $hi = [Math]::Max($r, [Math]::Max($g, $b))
    if ($lo -gt 0.42 -and ($hi - $lo) -lt 0.10) { $white += ,@($x, $y) }
    if ($r -gt 0.10 -and $r -gt $g * 1.25 -and $g -gt $b -and $hi -lt 0.65) { $iris += ,@($x, $y) }
    if ($hi -lt 0.075) { $dark += ,@($x, $y) }
  }
}
function box($pts, $label) {
  if ($pts.Count -eq 0) { "$label none"; return }
  $xs = $pts | ForEach-Object { $_[0] }; $ys = $pts | ForEach-Object { $_[1] }
  $x0 = ($xs | Measure-Object -Minimum).Minimum; $x1 = ($xs | Measure-Object -Maximum).Maximum
  $y0 = ($ys | Measure-Object -Minimum).Minimum; $y1 = ($ys | Measure-Object -Maximum).Maximum
  "{0,-6} n {1,6}  x {2,3}..{3,3} ({4,5:N1} mm)  y {5,3}..{6,3} ({7,5:N1} mm)" -f $label, $pts.Count, $x0, $x1, (($x1 - $x0) / $pxmm), $y0, $y1, (($y1 - $y0) / $pxmm)
}
box $white 'white'
box $iris 'iris'
box $dark 'dark'
$bmp.Dispose(); $img.Dispose()

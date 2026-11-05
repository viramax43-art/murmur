param([string]$Path, [double]$PxPerMm = 12.727, [double]$Band = 0.18)

# Measures a lip-focus probe: mouth height in mm, seam row, and how much darker
# the seam is than the lip body. Scale is passed in, because a lip close-up has
# no pupils to calibrate against (probe frames by width, so px/mm is exact --
# frame 0.22/zoom mm wide across the render width).
Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Bitmap]::FromFile((Resolve-Path $Path))
$w = $img.Width
$h = $img.Height
$rect = New-Object System.Drawing.Rectangle 0, 0, $w, $h
$data = $img.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadOnly, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$stride = $data.Stride
$bytes = New-Object byte[] ($stride * $h)
[System.Runtime.InteropServices.Marshal]::Copy($data.Scan0, $bytes, 0, $bytes.Length)
$img.UnlockBits($data)
$img.Dispose()

$x0 = [int]($w * (0.5 - $Band))
$x1 = [int]($w * (0.5 + $Band))
$rose = @{}
$lum = @{}
for ($y = 0; $y -lt $h; $y++) {
    $base = $y * $stride
    $n = 0; $s = 0.0; $m = 0
    for ($x = $x0; $x -lt $x1; $x++) {
        $i = $base + $x * 4
        $b = $bytes[$i]; $g = $bytes[$i + 1]; $r = $bytes[$i + 2]
        $l = (0.2126 * $r + 0.7152 * $g + 0.0722 * $b) / 255.0
        $s += $l; $m++
        if ($r -gt 60 -and ($g / [Math]::Max($r, 1)) -lt 0.72) { $n++ }
    }
    $rose[$y] = $n
    $lum[$y] = if ($m -gt 0) { $s / $m } else { 0 }
}

$covered = @($rose.Keys | Where-Object { $rose[$_] -gt (($x1 - $x0) * 0.35) } | Sort-Object)
if ($covered.Count -eq 0) { Write-Output "no rose rows found"; return }

$top = $covered[0]
$bot = $covered[-1]
Write-Output ("mouth rows {0}..{1}  height {2} px  = {3:N2} mm" -f $top, $bot, ($bot - $top), (($bot - $top) / $PxPerMm))

$mid = [int](($top + $bot) / 2)
# the seam is the darkest row in the middle of the vermilion: searching the whole
# span finds the shadow under the top edge instead, which is darker than the seam
$lo = $top + [int](0.25 * ($bot - $top))
$hi = $bot - [int](0.25 * ($bot - $top))
$seam = $lo
for ($y = $lo; $y -le $hi; $y++) { if ($lum[$y] -lt $lum[$seam]) { $seam = $y } }
Write-Output ("seam     row {0}  lum {1:N3}  ({2:N2} mm below top; upper lip {3:N2} mm / lower {4:N2} mm)" -f `
        $seam, $lum[$seam], (($seam - $top) / $PxPerMm), (($seam - $top) / $PxPerMm), (($bot - $seam) / $PxPerMm))
Write-Output ("seam vs body: {0:N3} at seam, {1:N3} 3 mm above, {2:N3} 3 mm below" -f $lum[$seam], $lum[[Math]::Max($top, $seam - [int](3 * $PxPerMm))], $lum[[Math]::Min($bot, $seam + [int](3 * $PxPerMm))])
Write-Output ("width: rim is fixed at 2 x 14.0 mm; widest rose row at {0}" -f (($rose.Keys | Sort-Object { $rose[$_] } -Descending | Select-Object -First 1)))

# vertical profile down a narrow central strip: tells whether the upper lip is
# catching the light or the lower one is, which is what the tone split exists to
# control
$c0 = [int]($w * 0.47)
$c1 = [int]($w * 0.53)
Write-Output "profile (mm below top : luminance, central 6% of width)"
for ($y = $top; $y -le $bot; $y += [int](2 * $PxPerMm)) {
    $base = $y * $stride
    $l = 0.0; $m = 0
    for ($x = $c0; $x -lt $c1; $x++) {
        $i = $base + $x * 4
        $l += (0.2126 * $bytes[$i + 2] + 0.7152 * $bytes[$i + 1] + 0.0722 * $bytes[$i]) / 255.0
        $m++
    }
    $v = if ($m -gt 0) { $l / $m } else { 0 }
    $rel = ($y - $seam) / $PxPerMm
    Write-Output ("  {0,6:N1}  {1:N3}   {2}" -f (($y - $top) / $PxPerMm), $v, ('#' * [int]($v * 40)))
}

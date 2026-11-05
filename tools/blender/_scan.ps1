param([string]$Path)

# Reads a probe render and reports where the painted features actually landed,
# in pixels. Scale is taken from the pupils, whose real separation is known
# (2 x 32.9 mm), so perspective magnification cancels out.
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

$rows = @{}
$darkLeft = @{}
$darkRight = @{}
for ($y = 0; $y -lt $h; $y++) {
    $dark = 0; $rose = 0; $ls = 0.0; $ln = 0; $rs = 0.0; $rn = 0
    $base = $y * $stride
    for ($x = 0; $x -lt $w; $x++) {
        $i = $base + $x * 4
        $b = $bytes[$i]; $g = $bytes[$i + 1]; $r = $bytes[$i + 2]
        $lum = (0.2126 * $r + 0.7152 * $g + 0.0722 * $b) / 255.0
        if ($lum -lt 0.30) {
            $dark++
            if ($x -lt ($w / 2)) { $ls += $x; $ln++ } else { $rs += $x; $rn++ }
        }
        elseif ($lum -lt 0.80 -and $r -gt 60 -and ($g / [Math]::Max($r, 1)) -lt 0.72) { $rose++ }
    }
    $rows[$y] = "$dark $rose"
    if ($ln -gt 0) { $darkLeft[$y] = $ls / $ln }
    if ($rn -gt 0) { $darkRight[$y] = $rs / $rn }
}

Write-Output "image $w x $h"
Write-Output "rows: y  dark  rose   (dark = brow/lash/pupil, rose = lip)"
for ($y = 0; $y -lt $h; $y += 4) {
    $v = $rows[$y] -split ' '
    if ([int]$v[0] -gt 3 -or [int]$v[1] -gt 3) {
        $mark = ''
        if ([int]$v[1] -gt ([int]$v[0] * 2)) { $mark = '  <- rose' }
        if ([int]$v[0] -gt ([int]$v[1] * 4)) { $mark = '  <- dark' }
        Write-Output ("  {0,4}  {1,4}  {2,4}{3}" -f $y, $v[0], $v[1], $mark)
    }
}

# pupil centres: the darkest, widest rows in the upper third
$best = $null
foreach ($y in $darkLeft.Keys) {
    if ($y -gt $h * 0.45) { continue }
    $v = ($rows[$y] -split ' ')
    if ([int]$v[0] -lt 4) { continue }
    $sep = $darkRight[$y] - $darkLeft[$y]
    if ($null -eq $best -or $sep -gt $best[2]) { $best = @($y, $darkLeft[$y], $sep, $darkRight[$y]) }
}
if ($best) {
    Write-Output ("pupils: row {0}  left {1:N1}  right {2:N1}  separation {3:N1} px  -> {4:N4} px/mm" -f $best[0], $best[1], $best[3], $best[2], ($best[2] / 65.8))
}

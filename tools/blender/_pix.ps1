param([string]$Path, [string]$Mode = "row", [int]$At = 190, [int]$From = 180, [int]$To = 340, [int]$Step = 6)

# Prints the colour along a row or column of a probe render, so a suspicious hue
# can be traced to the shader term that made it instead of guessed at.
Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Bitmap]::FromFile((Resolve-Path $Path))
if ($Mode -eq "row") {
    Write-Output "row y=$At, x from $From to $To"
    for ($x = $From; $x -le $To; $x += $Step) {
        $c = $img.GetPixel($x, $At)
        $h = ($c.R * 0.2126 + $c.G * 0.7152 + $c.B * 0.0722) / 255.0
        Write-Output ("  x {0,4}  rgb {1,3} {2,3} {3,3}  lum {4:N3}  g/r {5:N2}" -f $x, $c.R, $c.G, $c.B, $h, ($c.G / [Math]::Max($c.R, 1)))
    }
}
else {
    Write-Output "column x=$At, y from $From to $To"
    for ($y = $From; $y -le $To; $y += $Step) {
        $c = $img.GetPixel($At, $y)
        $h = ($c.R * 0.2126 + $c.G * 0.7152 + $c.B * 0.0722) / 255.0
        Write-Output ("  y {0,4}  rgb {1,3} {2,3} {3,3}  lum {4:N3}  g/r {5:N2}" -f $y, $c.R, $c.G, $c.B, $h, ($c.G / [Math]::Max($c.R, 1)))
    }
}
$img.Dispose()

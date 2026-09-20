# Generates maskable PWA icons matching the dashboard palette.
Add-Type -AssemblyName System.Drawing

function Draw-Candle {
  param($Graphics, $Scale, $X, $WickTop, $WickBottom, $BodyTop, $BodyBottom, $BodyW, $Color)
  $wickPen = New-Object System.Drawing.Pen $Color, ([Math]::Max(2, [int](6 * $Scale)))
  $Graphics.DrawLine($wickPen, $X, $WickTop, $X, $WickBottom)
  $wickPen.Dispose()
  $brush = New-Object System.Drawing.SolidBrush $Color
  $left = [int]($X - $BodyW / 2)
  $height = [Math]::Max(1, [int]($BodyBottom - $BodyTop))
  $Graphics.FillRectangle($brush, $left, [int]$BodyTop, [int]$BodyW, $height)
  $brush.Dispose()
}

function New-DashboardIcon {
  param([int]$Size, [string]$OutPath)
  $bmp = New-Object System.Drawing.Bitmap $Size, $Size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.Clear([System.Drawing.Color]::FromArgb(255, 10, 14, 20))

  $pad = [int]($Size * 0.12)
  $rect = New-Object System.Drawing.Rectangle $pad, $pad, ($Size - 2 * $pad), ($Size - 2 * $pad)
  $radius = [int]($Size * 0.18)
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $radius * 2
  $path.AddArc($rect.X, $rect.Y, $d, $d, 180, 90)
  $path.AddArc($rect.Right - $d, $rect.Y, $d, $d, 270, 90)
  $path.AddArc($rect.Right - $d, $rect.Bottom - $d, $d, $d, 0, 90)
  $path.AddArc($rect.X, $rect.Bottom - $d, $d, $d, 90, 90)
  $path.CloseFigure()
  $panelBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 16, 21, 31))
  $g.FillPath($panelBrush, $path)

  $cx = $Size / 2
  $scale = $Size / 512.0
  $gold = [System.Drawing.Color]::FromArgb(255, 232, 163, 61)
  $teal = [System.Drawing.Color]::FromArgb(255, 38, 166, 154)
  $red = [System.Drawing.Color]::FromArgb(255, 239, 83, 80)
  $bodyW = 48 * $scale

  Draw-Candle $g $scale ($cx - 90 * $scale) (170 * $scale) (360 * $scale) (230 * $scale) (330 * $scale) $bodyW $red
  Draw-Candle $g $scale $cx (130 * $scale) (390 * $scale) (180 * $scale) (300 * $scale) ($bodyW + 4 * $scale) $gold
  Draw-Candle $g $scale ($cx + 90 * $scale) (200 * $scale) (350 * $scale) (240 * $scale) (320 * $scale) $bodyW $teal

  $g.Dispose()
  $dir = Split-Path -Parent $OutPath
  if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }
  $bmp.Save($OutPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  $panelBrush.Dispose()
  $path.Dispose()
}

$root = Split-Path -Parent $PSScriptRoot
$iconDir = Join-Path $root "icons"
New-DashboardIcon 180 (Join-Path $iconDir "icon-180.png")
New-DashboardIcon 192 (Join-Path $iconDir "icon-192.png")
New-DashboardIcon 512 (Join-Path $iconDir "icon-512.png")
Write-Output "Wrote icons to $iconDir"

# Requires: Windows PowerShell with winget available (optional)
# This script installs/configures Python + spotdl and wires ffmpeg for the bot.
param(
  [string]$RepoRoot = (Resolve-Path "$PSScriptRoot\.."),
  [switch]$NoWinget
)

Write-Host "== KONMI BOT • Setup Spotify + spotdl ==" -ForegroundColor Cyan
Write-Host "Repo:" $RepoRoot

function Test-Cmd {
  param([string]$Cmd, [string]$Args = "--version")
  try {
    $p = Start-Process -FilePath $Cmd -ArgumentList $Args -NoNewWindow -PassThru -Wait -ErrorAction Stop
    return $true
  } catch { return $false }
}

function Ensure-Python {
  if (Test-Cmd "py" "--version" -or Test-Cmd "python" "--version") {
    Write-Host "Python: OK" -ForegroundColor Green
    return
  }
  if ($NoWinget) { throw "Python no detectado y winget deshabilitado. Instálalo manualmente." }
  if (-not (Test-Cmd "winget" "--version")) { throw "winget no disponible. Instala Python manualmente." }
  Write-Host "Instalando Python via winget..." -ForegroundColor Yellow
  winget install -e --id Python.Python.3.12 -s winget --accept-package-agreements --accept-source-agreements
  if (-not (Test-Cmd "py" "--version" -or Test-Cmd "python" "--version")) { throw "No se pudo instalar/detectar Python." }
}

function Ensure-Spotdl {
  Write-Host "Instalando/actualizando spotdl (Python módulo)..." -ForegroundColor Yellow
  try { & py -m pip install --upgrade pip } catch {}
  try { & py -m pip install --upgrade spotdl } catch {}
  if (-not (Test-Cmd "py" "-m spotdl --version")) {
    if (Test-Cmd "python" "-m spotdl --version") { return }
    throw "No se pudo validar spotdl. Verifica instalación de Python/pip."
  }
  Write-Host "spotdl: OK" -ForegroundColor Green
}

function Detect-FFmpegStaticPath {
  $node = (Get-Command node -ErrorAction SilentlyContinue)
  if ($null -ne $node) {
    try {
      $ff = & node -e "console.log(require('path').resolve(require('ffmpeg-static')))" 2>$null
      if ($LASTEXITCODE -eq 0 -and $ff -and (Test-Path $ff)) { return $ff }
    } catch {}
  }
  $guess = Join-Path $RepoRoot "backend\full\node_modules\ffmpeg-static\ffmpeg.exe"
  if (Test-Path $guess) { return $guess }
  return $null
}

function Ensure-EnvLine {
  param([string]$EnvFile, [string]$Key, [string]$Value)
  if (-not (Test-Path $EnvFile)) { '' | Out-File -FilePath $EnvFile -Encoding UTF8 }
  $lines = Get-Content $EnvFile -ErrorAction SilentlyContinue
  if (-not $lines) { $lines = @() }
  $exists = $false
  for ($i=0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -match "^$Key=") { $lines[$i] = "$Key=$Value"; $exists = $true; break }
  }
  if (-not $exists) { $lines += "$Key=$Value" }
  Set-Content -Path $EnvFile -Value $lines -Encoding UTF8
}

Ensure-Python
Ensure-Spotdl

$ffpath = Detect-FFmpegStaticPath
if ($ffpath) {
  Write-Host "FFmpeg detectado:" $ffpath -ForegroundColor Green
} else {
  Write-Host "FFmpeg no detectado en ffmpeg-static. Puedes instalarlo (winget install Gyan.FFmpeg) y configurar FFMPEG_PATH." -ForegroundColor Yellow
}

$rootEnv = Join-Path $RepoRoot ".env"
$beEnv   = Join-Path $RepoRoot "backend\full\.env"

if ($ffpath) {
  Ensure-EnvLine -EnvFile $rootEnv -Key "FFMPEG_PATH" -Value $ffpath
  Ensure-EnvLine -EnvFile $beEnv   -Key "FFMPEG_PATH" -Value $ffpath
}

if (-not (Select-String -Path $rootEnv -Pattern "^SPOTIFY_CLIENT_ID=" -Quiet)) {
  Add-Content -Path $rootEnv "SPOTIFY_CLIENT_ID="
}
if (-not (Select-String -Path $rootEnv -Pattern "^SPOTIFY_CLIENT_SECRET=" -Quiet)) {
  Add-Content -Path $rootEnv "SPOTIFY_CLIENT_SECRET="
}

Write-Host ""; Write-Host "== Listo ==" -ForegroundColor Cyan
Write-Host "1) Define SPOTIFY_CLIENT_ID y SPOTIFY_CLIENT_SECRET en: $rootEnv" -ForegroundColor White
if ($ffpath) { Write-Host "2) FFMPEG_PATH ya configurado." } else { Write-Host "2) Instala FFmpeg o deja que ffmpeg-static se use cuando sea posible." }
Write-Host "3) Prueba:  py -m spotdl --version  /  ffmpeg -version" -ForegroundColor White
Write-Host "4) Ejecuta el backend y usa /spotify (usa spotdl, con fallback a yt-dlp si falla)." -ForegroundColor White


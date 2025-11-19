<#
.SYNOPSIS
  Configura dependencias de multimedia para KONMI-BOT (yt-dlp y ffmpeg) en Windows

.DESCRIPTION
  - Descarga yt-dlp.exe en backend/full/bin si no existe
  - Detecta ffmpeg (vía ffmpeg-static o PATH) y lo exporta a .env
  - Prepara/actualiza variables en backend/full/.env: YTDLP_PATH, FFMPEG_PATH y ajustes de yt-dlp

.USAGE
  PowerShell (como usuario):
    Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
    ./scripts/setup-media.ps1

  Si ya tienes yt-dlp/ffmpeg instalados en otras rutas, el script los usará si están en PATH.

.NOTES
  - Este script NO requiere privilegios de administrador.
  - No sobreescribe claves ajenas; solo añade/actualiza las variables de media si faltan.
#>

param(
  [switch]$Force
)

function Write-Info($msg) { Write-Host "[i] $msg" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "[✓] $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "[!] $msg" -ForegroundColor Yellow }
function Write-Err($msg)  { Write-Host "[x] $msg" -ForegroundColor Red }

try {
  $ScriptDir = Split-Path -Parent $PSCommandPath
} catch { $ScriptDir = $PSScriptRoot }
$RepoRoot   = Split-Path -Parent $ScriptDir
$BackendDir = Join-Path $RepoRoot 'backend\full'
$BinDir     = Join-Path $BackendDir 'bin'
$EnvFile    = Join-Path $BackendDir '.env'

New-Item -ItemType Directory -Force -Path $BinDir | Out-Null

# 1) Resolver yt-dlp
$YtDlpExe = Join-Path $BinDir 'yt-dlp.exe'
$YtDlpUrl = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe'

function Test-YtDlp($cmd) {
  try {
    $p = Start-Process -FilePath $cmd -ArgumentList '--version' -NoNewWindow -PassThru -Wait -ErrorAction Stop
    return $true
  } catch { return $false }
}

$ResolvedYtDlp = $null
if (-not $Force) {
  # Buscar en PATH
  foreach ($cand in @('yt-dlp.exe','yt-dlp','yt')) {
    try {
      $where = (Get-Command $cand -ErrorAction SilentlyContinue).Path
      if ($where -and (Test-YtDlp $where)) { $ResolvedYtDlp = $where; break }
    } catch {}
  }
}

if (-not $ResolvedYtDlp) {
  if ((-not (Test-Path $YtDlpExe)) -or $Force) {
    Write-Info "Descargando yt-dlp.exe ..."
    try {
      Invoke-WebRequest -Uri $YtDlpUrl -OutFile $YtDlpExe -UseBasicParsing -ErrorAction Stop
      Write-Ok "yt-dlp descargado en $YtDlpExe"
    } catch {
      Write-Err "No se pudo descargar yt-dlp: $($_.Exception.Message)"
      Write-Warn "Instálalo manualmente y re-ejecuta: https://github.com/yt-dlp/yt-dlp"
    }
  } else {
    Write-Info "yt-dlp ya existe en $YtDlpExe"
  }
}

if (-not $ResolvedYtDlp) { $ResolvedYtDlp = $YtDlpExe }

# 2) Resolver ffmpeg (preferir ffmpeg-static si existe)
$FfmpegStatic = Join-Path $BackendDir 'node_modules\ffmpeg-static\ffmpeg.exe'
$ResolvedFfmpeg = $null
if (Test-Path $FfmpegStatic) {
  $ResolvedFfmpeg = $FfmpegStatic
  Write-Info "ffmpeg-static detectado: $ResolvedFfmpeg"
} else {
  try {
    $ff = (Get-Command 'ffmpeg' -ErrorAction SilentlyContinue).Path
    if ($ff) { $ResolvedFfmpeg = $ff; Write-Info "ffmpeg en PATH: $ResolvedFfmpeg" }
  } catch {}
}

if (-not $ResolvedFfmpeg) {
  Write-Warn "ffmpeg no detectado. Si usas 'ffmpeg-static', ejecuta 'npm i' dentro de backend/full para instalarlo."
}

# 3) Preparar/actualizar .env (solo variables de media)
$envLines = @()
if (Test-Path $EnvFile) { $envLines = Get-Content $EnvFile -ErrorAction SilentlyContinue }
if (-not $envLines) { $envLines = @() }

function Upsert-Env([string]$key, [string]$value) {
  $escaped = [Regex]::Escape($key)
  $pattern = "^${escaped}\s*=.*$"
  $exists = $false
  $newLines = @()
  foreach ($l in $envLines) {
    if ($l -match $pattern) {
      $exists = $true
      if ($value) { $newLines += "$key=$value" } else { $newLines += $l }
    } else {
      $newLines += $l
    }
  }
  if (-not $exists -and $value) { $newLines += "$key=$value" }
  $script:envLines = $newLines
}

if ($ResolvedYtDlp -and (Test-Path $ResolvedYtDlp)) {
  Upsert-Env -key 'YTDLP_PATH' -value $ResolvedYtDlp
  Write-Ok "YTDLP_PATH = $ResolvedYtDlp"
} else {
  Write-Warn "YTDLP_PATH no se estableció (no se encontró yt-dlp)."
}

if ($ResolvedFfmpeg -and (Test-Path $ResolvedFfmpeg)) {
  Upsert-Env -key 'FFMPEG_PATH' -value $ResolvedFfmpeg
  Write-Ok "FFMPEG_PATH = $ResolvedFfmpeg"
}

# Ajustes opcionales recomendados para YouTube/yt-dlp
Upsert-Env -key 'YTDLP_USER_AGENT'      -value 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
Upsert-Env -key 'YTDLP_EXTRACTOR_ARGS'  -value 'youtube:player_client=web,android'

try {
  Set-Content -LiteralPath $EnvFile -Value ($envLines -join "`r`n") -Encoding UTF8
  Write-Ok ".env actualizado: $EnvFile"
} catch {
  Write-Err "No se pudo escribir .env: $($_.Exception.Message)"
}

Write-Host ""
Write-Ok "Configuración de multimedia finalizada."
Write-Host "- Verifica yt-dlp: `"$ResolvedYtDlp --version`"" -ForegroundColor Gray
Write-Host "- Verifica ffmpeg:  `"$ResolvedFfmpeg -version`"" -ForegroundColor Gray
Write-Host "- Reinicia el bot: npm start (o reinicia el proceso)" -ForegroundColor Gray

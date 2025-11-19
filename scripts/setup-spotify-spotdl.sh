#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
echo "== KONMI BOT • Setup Spotify + spotdl =="
echo "Repo: $REPO_ROOT"

have_cmd() { command -v "$1" >/dev/null 2>&1; }

ensure_python() {
  if have_cmd python3 || have_cmd python; then
    echo "Python: OK"
    return
  fi
  if have_cmd apt-get; then
    echo "Instalando python3 (apt)..."
    sudo apt-get update && sudo apt-get install -y python3 python3-pip
  elif have_cmd brew; then
    echo "Instalando python (brew)..."
    brew install python
  else
    echo "Instala Python manualmente (no se detectó apt ni brew)." >&2
    exit 1
  fi
}

ensure_spotdl() {
  echo "Instalando/actualizando spotdl (pip)..."
  if have_cmd python3; then python3 -m pip install --upgrade pip spotdl || true; fi
  if have_cmd python; then python -m pip install --upgrade pip spotdl || true; fi
  if python3 -m spotdl --version >/dev/null 2>&1 || python -m spotdl --version >/dev/null 2>&1; then
    echo "spotdl: OK"
  else
    echo "No se pudo validar spotdl. Revisa instalación de Python/pip." >&2
    exit 1
  fi
}

detect_ffmpeg_static() {
  if have_cmd node; then
    node -e "console.log(require('path').resolve(require('ffmpeg-static')))" 2>/dev/null || true
  fi
}

ensure_env_line() {
  local envfile="$1" key="$2" value="$3"
  touch "$envfile"
  if grep -qE "^${key}=" "$envfile"; then
    sed -i.bak -E "s|^${key}=.*|${key}=${value}|" "$envfile"
  else
    printf "%s=%s\n" "$key" "$value" >> "$envfile"
  fi
}

ensure_python
ensure_spotdl

FF="$(detect_ffmpeg_static || true)"
if [ -n "$FF" ] && [ -f "$FF" ]; then
  echo "FFmpeg detectado: $FF"
  ensure_env_line "$REPO_ROOT/.env" "FFMPEG_PATH" "$FF"
  ensure_env_line "$REPO_ROOT/backend/full/.env" "FFMPEG_PATH" "$FF"
else
  echo "FFmpeg no detectado en ffmpeg-static. Puedes instalarlo por sistema y configurar FFMPEG_PATH." >&2
fi

touch "$REPO_ROOT/.env"
grep -q '^SPOTIFY_CLIENT_ID=' "$REPO_ROOT/.env" || echo 'SPOTIFY_CLIENT_ID=' >> "$REPO_ROOT/.env"
grep -q '^SPOTIFY_CLIENT_SECRET=' "$REPO_ROOT/.env" || echo 'SPOTIFY_CLIENT_SECRET=' >> "$REPO_ROOT/.env"

echo ""
echo "== Listo =="
echo "1) Define SPOTIFY_CLIENT_ID y SPOTIFY_CLIENT_SECRET en: $REPO_ROOT/.env"
if [ -n "$FF" ]; then echo "2) FFMPEG_PATH ya configurado."; else echo "2) Instala FFmpeg o deja que ffmpeg-static funcione cuando sea posible."; fi
echo "3) Prueba: python3 -m spotdl --version  /  ffmpeg -version"
echo "4) Ejecuta el backend y usa /spotify (usa spotdl, fallback yt-dlp si falla)."


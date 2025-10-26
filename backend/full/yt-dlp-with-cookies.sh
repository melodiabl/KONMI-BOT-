#!/usr/bin/env bash
set -euo pipefail
# Simple helper to run yt-dlp using a cookies file provided either as:
# - YTDLP_COOKIES (path to an existing cookies file), or
# - YTDLP_COOKIES_B64 (base64-encoded cookies content), or
# - default path /home/admin/KONMI-BOT-/backend/full/all_cookies.txt
#
# Usage:
#   ./yt-dlp-with-cookies.sh [URL]
# If no URL is provided it will use the YouTube URL you gave by default.

URL="${1:-https://www.youtube.com/watch?v=YQHsXMglC9A&list=RD9fyrQc7407o&index=28}"
COOKIES_ENV="${YTDLP_COOKIES:-}"
COOKIES_B64="${YTDLP_COOKIES_B64:-}"
DEFAULT_PATH="/home/admin/KONMI-BOT-/backend/full/all_cookies.txt"
TMPFILE=""

cleanup() {
  if [[ -n "$TMPFILE" && -f "$TMPFILE" ]]; then
    # try secure removal then fallback to rm
    shred -u "$TMPFILE" 2>/dev/null || rm -f "$TMPFILE" || true
  fi
}
trap cleanup EXIT

COOKIES=""
if [[ -n "$COOKIES_ENV" && -f "$COOKIES_ENV" ]]; then
  COOKIES="$COOKIES_ENV"
fi

if [[ -z "$COOKIES" && -n "$COOKIES_B64" ]]; then
  TMPFILE=$(mktemp /tmp/yt_cookies_XXXXXX)
  echo "$COOKIES_B64" | base64 -d > "$TMPFILE"
  chmod 600 "$TMPFILE"
  COOKIES="$TMPFILE"
fi

if [[ -z "$COOKIES" && -f "$DEFAULT_PATH" ]]; then
  COOKIES="$DEFAULT_PATH"
fi

if [[ -z "$COOKIES" ]]; then
  echo "No cookies file found. Provide one via YTDLP_COOKIES (path) or YTDLP_COOKIES_B64 (base64), or place all_cookies.txt at $DEFAULT_PATH"
  exit 2
fi

echo "Using cookies file: $COOKIES"

# Ensure yt-dlp is available, try user pip install if not
if ! command -v yt-dlp >/dev/null 2>&1; then
  echo "yt-dlp not found in PATH. Attempting to install with pip (user)."
  if command -v python3 >/dev/null 2>&1; then
    python3 -m pip install --user -U yt-dlp
    export PATH="$PATH:$HOME/.local/bin"
  else
    echo "python3 not found; please install yt-dlp manually." >&2
    exit 3
  fi
fi

mkdir -p downloads

# Run yt-dlp with cookies and recommended args for VPS.
# You can override defaults via env:
#   YTDLP_EXTRACTOR_ARGS (e.g. "youtube:player_client=web,android")
#   YTDLP_USER_AGENT (e.g. Android UA)
EXTRACTOR_ARGS=${YTDLP_EXTRACTOR_ARGS:-"youtube:player_client=web,android"}
UA=${YTDLP_USER_AGENT:-"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"}

yt-dlp \
  --cookies "$COOKIES" \
  --extractor-args "$EXTRACTOR_ARGS" \
  --user-agent "$UA" \
  -o 'downloads/%(uploader)s - %(title)s.%(ext)s' \
  "$URL"

echo "Done. Files (if any) are in ./downloads"

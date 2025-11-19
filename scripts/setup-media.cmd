@echo off
setlocal
REM Wrapper para ejecutar el script de PowerShell que configura yt-dlp/ffmpeg
if exist "%~dp0setup-media.ps1" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup-media.ps1" %*
  set ERR=%ERRORLEVEL%
  if not %ERR%==0 (
    echo [x] Fallo ejecutando PowerShell. Abre PowerShell y ejecuta: .\scripts\setup-media.ps1
  )
) else (
  echo [x] No se encontro scripts\setup-media.ps1
)
endlocal
exit /b 0


# Ensura salida UTF-8 y corre el backend Full con Node
# Uso: powershell -ExecutionPolicy Bypass -File scripts/windows/start-utf8.ps1

param(
  [switch]$NoMigrate
)

try {
  # Forzar consola y streams a UTF-8
  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
  $OutputEncoding = New-Object System.Text.UTF8Encoding $false

  # Cambiar code page de la consola a UTF-8
  & chcp.com 65001 | Out-Null

  # Variables de entorno comunes para UTF-8
  $env:LANG = $env:LANG -as [string]
  if ([string]::IsNullOrWhiteSpace($env:LANG)) { $env:LANG = 'es_ES.UTF-8' }
  $env:LC_ALL = 'es_ES.UTF-8'
  $env:LC_CTYPE = 'es_ES.UTF-8'

  Write-Host "Consola configurada a UTF-8 (code page 65001)" -ForegroundColor Green
  Write-Host "Iniciando backend (full)..." -ForegroundColor Cyan

  Push-Location "$PSScriptRoot\..\..\backend\full"

  if (-not $NoMigrate) {
    try {
      Write-Host "Ejecutando migraciones..." -ForegroundColor Yellow
      npm run migrate | Out-Host
    } catch {
      Write-Warning "No se pudieron ejecutar las migraciones: $($_.Exception.Message)"
    }
  }

  Write-Host "Ejecutando: node index.js" -ForegroundColor Green
  node index.js
}
finally {
  Pop-Location | Out-Null
}



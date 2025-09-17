#!/bin/bash

echo "🚀 Iniciando WhatsApp Bot Panel..."
echo "=================================="

# 1) Construir frontend fuera de Docker
echo "🧱 Construyendo frontend (npm run build) fuera de Docker..."
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="${SCRIPT_DIR}"

if [ -d "${REPO_ROOT}/frontend-panel" ]; then
  (
    cd "${REPO_ROOT}/frontend-panel" && \
    if [ -f package-lock.json ]; then
      npm ci || npm install
    else
      npm install
    fi && \
    npm run build
  ) || {
    echo "❌ Error construyendo el frontend. Revisa los logs anteriores." >&2
    exit 1
  }
else
  echo "❌ Carpeta frontend-panel no encontrada en ${REPO_ROOT}" >&2
  exit 1
fi

# Resolver comando docker compose (plugin o binario clásico)
if command -v docker compose >/dev/null 2>&1; then
  DCMD="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  DCMD="docker-compose"
else
  echo "❌ No se encontró docker compose ni docker-compose en el sistema" >&2
  exit 1
fi

# 2) Limpiar Docker si es necesario
echo "🧹 Limpiando Docker..."
${DCMD} down -v --remove-orphans 2>/dev/null || true
docker system prune -f 2>/dev/null || true

# 3) Construir e iniciar servicios (backend, db, etc.)
echo "🔨 Construyendo e iniciando servicios con Docker..."
${DCMD} up --build -d

echo ""
echo "✅ Sistema iniciado!"
echo ""
echo "📱 Panel Web (Caddy en host): http://localhost"
echo "🔧 Adminer (DB): http://localhost:8080"
echo "⚙️  Backend API: http://localhost:3001"
echo ""
echo "📋 Siguiendo logs del backend (Ctrl+C para salir)..."
${DCMD} logs -f backend
echo ""
echo "🛑 Para detener el sistema luego de salir de los logs:"
echo "   ${DCMD} down"
echo ""

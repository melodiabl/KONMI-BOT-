#!/bin/bash

echo "🚀 Iniciando WhatsApp Bot Panel..."
echo "=================================="

# Limpiar Docker si es necesario
echo "🧹 Limpiando Docker..."
docker-compose down -v --remove-orphans 2>/dev/null || true
docker system prune -f 2>/dev/null || true

# Construir e iniciar servicios
echo "🔨 Construyendo e iniciando servicios..."
docker-compose up --build -d

echo ""
echo "✅ Sistema iniciado!"
echo ""
echo "📱 Panel Web: http://localhost"
echo "🔧 Adminer (DB): http://localhost:8080"
echo "⚙️  Backend API: http://localhost:3001"
echo ""
echo "📋 Para ver logs del backend:"
echo "   docker-compose logs -f backend"
echo ""
echo "📋 Para ver logs del frontend:"
echo "   docker-compose logs -f frontend-panel"
echo ""
echo "🛑 Para detener el sistema:"
echo "   docker-compose down"
echo ""



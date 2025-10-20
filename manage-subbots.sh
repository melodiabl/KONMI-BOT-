#!/bin/bash

# Script de gestión de subbots
# Uso: ./manage-subbots.sh [start|stop|restart|status|logs|cleanup]

case "$1" in
  start)
    echo "🚀 Iniciando subbots..."
    docker-compose -f docker-compose.subbots.yml up -d
    echo "✅ Subbots iniciados"
    ;;
  stop)
    echo "🛑 Deteniendo subbots..."
    docker-compose -f docker-compose.subbots.yml down
    echo "✅ Subbots detenidos"
    ;;
  restart)
    echo "🔄 Reiniciando subbots..."
    docker-compose -f docker-compose.subbots.yml down
    docker-compose -f docker-compose.subbots.yml up -d
    echo "✅ Subbots reiniciados"
    ;;
  status)
    echo "📊 Estado de subbots:"
    docker-compose -f docker-compose.subbots.yml ps
    ;;
  logs)
    echo "📝 Logs de subbots:"
    docker-compose -f docker-compose.subbots.yml logs -f
    ;;
  cleanup)
    echo "🧹 Limpiando subbots inactivos..."
    docker-compose -f docker-compose.subbots.yml down
    docker system prune -f
    echo "✅ Limpieza completada"
    ;;
  build)
    echo "🔨 Construyendo subbots..."
    docker-compose -f docker-compose.subbots.yml build
    echo "✅ Subbots construidos"
    ;;
  *)
    echo "Uso: $0 {start|stop|restart|status|logs|cleanup|build}"
    echo ""
    echo "Comandos disponibles:"
    echo "  start    - Iniciar todos los subbots"
    echo "  stop     - Detener todos los subbots"
    echo "  restart  - Reiniciar todos los subbots"
    echo "  status   - Mostrar estado de subbots"
    echo "  logs     - Mostrar logs de subbots"
    echo "  cleanup  - Limpiar subbots inactivos"
    echo "  build    - Construir imágenes de subbots"
    exit 1
    ;;
esac









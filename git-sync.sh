#!/bin/bash

# Script de sincronización automática para el repositorio
# Creado para la VPS 178.156.179.129

# Definir variables
PROJECT_DIR="/home/admin/bot-whatsapp-panel-2.5-completo-v2"
LOG_FILE="$PROJECT_DIR/git-sync.log"

# Registrar inicio
echo "[$(date)] Iniciando sincronización" >> $LOG_FILE

# Ir al directorio del proyecto
cd $PROJECT_DIR

# Guardar el hash actual
OLD_HASH=$(git rev-parse HEAD)

# Intentar hacer pull
git pull origin main >> $LOG_FILE 2>&1

# Verificar si hubo cambios
NEW_HASH=$(git rev-parse HEAD)

if [ "$OLD_HASH" != "$NEW_HASH" ]; then
  echo "[$(date)] Cambios detectados, reiniciando servicios" >> $LOG_FILE
  
  # Reiniciar servicios según sea necesario
  bash ./start-system.sh >> $LOG_FILE 2>&1
  node restart-bot.js >> $LOG_FILE 2>&1
else
  echo "[$(date)] No hay cambios nuevos" >> $LOG_FILE
fi
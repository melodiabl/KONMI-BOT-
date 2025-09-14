#!/bin/sh
set -euo pipefail

CODE="$1"
if ! echo "$CODE" | grep -q '^[0-9]\{8\}$'; then
  echo "Uso: $0 <codigo_de_8_digitos>"
  exit 1
fi

SERVICE="subbot_${CODE}"
export SUBBOT_CODE="$CODE"

echo "➡️  Creando volumen de auth para $SERVICE"
rm -rf "/home/admin/bot-whatsapp-panel-2.5-completo-v2/backend/full/storage/auth/subbot-${CODE}" # Clear existing auth
mkdir -p "/home/admin/bot-whatsapp-panel-2.5-completo-v2/backend/full/storage/auth/subbot-${CODE}"
mkdir -p "/home/admin/bot-whatsapp-panel-2.5-completo-v2/backend/full/storage/subbot-exports"

echo "➡️  Levantando $SERVICE"
docker run -d \
  --name "$SERVICE" \
  --network bot-whatsapp-panel-25-completo-v2_default \
  -e DB_HOST=db \
  -e DB_PORT="5432" \
  -e DB_USER=appuser \
  -e DB_PASSWORD=superpass \
  -e DB_NAME=appdb \
  -e NODE_ENV=production \
  -e PORT="0" \
  -e TZ=America/Asuncion \
  -e SUBBOT_CODE="$CODE" \
  -v "/home/admin/bot-whatsapp-panel-2.5-completo-v2/backend/full/storage/auth/subbot-${CODE}:/app/storage/auth/subbot-${CODE}" \
  -v "/home/admin/bot-whatsapp-panel-2.5-completo-v2/backend/full/storage/subbot-exports:/app/storage/subbot-exports" \
  bot-whatsapp-panel-25-completo-v2_backend:latest \
  node index.js

echo "⏳ Esperando que el subbot se conecte y genere código/QR..."

# Esperar hasta 10 segundos a que el subbot genere los archivos
i=1
while [ $i -le 10 ]; do
  if [ -f "/home/admin/bot-whatsapp-panel-2.5-completo-v2/backend/full/storage/subbot-exports/code-${CODE}.txt" ] && [ -f "/home/admin/bot-whatsapp-panel-2.5-completo-v2/backend/full/storage/subbot-exports/qr-${CODE}.png" ]; then
    echo "✅ Subbot $SERVICE generó código y QR exitosamente"
    echo "📁 Archivos creados:"
    echo "   - /home/admin/bot-whatsapp-panel-2.5-completo-v2/backend/full/storage/subbot-exports/code-${CODE}.txt"
    echo "   - /home/admin/bot-whatsapp-panel-2.5-completo-v2/backend/full/storage/subbot-exports/qr-${CODE}.png"
    exit 0
  fi
  echo "⏳ Intento $i/10 - Esperando archivos del subbot..."
  sleep 1
  i=$((i + 1))
done

echo "⚠️  Subbot $SERVICE iniciado pero no generó archivos en 10 segundos"
echo "🔍 Revisa logs con: docker logs -f $SERVICE"
exit 1




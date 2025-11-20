# Cambios Realizados - QR/Pairing Fix

## Problema
- QR se regeneraba continuamente al escanear (evento restartStreamRequiere)
- Pairing code se desconectaba después de generar
- Loop infinito de reconexión automática

## Solución

### 1. **whatsapp.js**
- **Línea 360**: Simplificado listener de `creds.update` (removido setTimeout y validaciones innecesarias)
- **Línea 346**: Set `printQRInTerminal: true` para que Baileys maneje QR nativo
- **Líneas 384-394**: Agregada visualización de QR en imagen ASCII (usando qrcode-terminal)
  - Muestra header formateado
  - Genera QR escaneables en terminal
  - Se muestra una sola vez al generar
- **Líneas 456-470**: Removida reconexión automática en evento `connection.close`
  - Ahora solo maneja status 428 (esperando pairing en teléfono)
  - Detecta logout (401/403) y detiene
  - Evita el loop infinito de restartStream

### 2. **subbot-runner.js**
- **Línea 9**: Importado `qrcode-terminal` para visualización
- **Líneas 55-75**: Agregada visualización de QR en imagen ASCII
  - Muestra header con código del subbot
  - Genera QR escaneables en terminal
  - Se muestra una sola vez al generar

## Flujo Resultante
1. Usuario elige QR o Pairing en `npm start`
2. Sistema genera y muestra QR en imagen ASCII (escaneable desde terminal)
3. Usuario escanea con WhatsApp
4. Socket se conecta sin regenerar QR
5. Pairing code se genera una sola vez si se selecciona esa opción

## Cambios en Eventos
- ❌ Removido: reconexión automática en disconnect
- ✅ Agregado: visualización de QR en ASCII art (qrcode-terminal)
- ✅ Mantenido: visualización de pairing code en consola
- ✅ Mantenido: listeners de mensajes y eventos del grupo

## Testing
```bash
npm start
# Selecciona 1 para QR o 2 para Pairing
# Verás la imagen ASCII del QR en la terminal
# Escanea con tu teléfono
# Se conectará sin regenerar el código
```

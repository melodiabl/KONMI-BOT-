# 🤖 KONMI-BOT - Opciones de Conexión

## 📱 **MÉTODOS DE CONEXIÓN DISPONIBLES**

### **🔗 1. QR Code (Método tradicional)**
```bash
npm run start:qr
```
- Genera código QR para escanear
- Válido por 2 minutos
- Necesita cámara para escanear

### **📱 2. Pairing Code (Método con código)**
```bash
npm run start:options
```
- Te pregunta el número de teléfono
- Genera código fijo: **KONMIBOT**
- Válido por 10 minutos
- No necesita cámara

### **⚡ 3. Inicio con opciones interactivas**
```bash
npm run start:pairing
```
- Menú interactivo para elegir método
- Opción 1: QR Code
- Opción 2: Pairing Code

## 🎯 **PAIRING CODE PERSONALIZADO**

### **✅ Modificaciones realizadas en Baileys:**

**Archivo:** `node_modules/@whiskeysockets/baileys/lib/Socket/socket.js`
```javascript
// Línea 539 - Código fijo
const pairingCode = customPairingCode ?? 'KONMIBOT';
```

**Resultado:** El código de vinculación siempre será **KONMIBOT**

## 📋 **INSTRUCCIONES DE USO**

### **🔢 Para usar Pairing Code:**

1. **Ejecutar el bot:**
   ```bash
   npm run start:options
   ```

2. **Seleccionar opción 2** (Pairing Code)

3. **Ingresar tu número** (ej: 5491234567890)

4. **El sistema mostrará:**
   ```
   ╭─────────────────────────────────────────╮
   │           📱 PAIRING CODE GENERADO       │
   ╰─────────────────────────────────────────╯
   ┌─ 🔢 CÓDIGO ────────────────────────────┐
   │ 📱 Número: 5491234567890
   │ 🔑 Código: KONMIBOT
   │ ⏰ Válido por: 10 minutos
   │ 📱 Aparecerá como: KONMI-BOT
   └───────────────────────────────────────┘
   ```

5. **En tu WhatsApp:**
   - Abre WhatsApp en el número que ingresaste
   - Ve a **Configuración** → **Dispositivos vinculados**
   - Toca **"Vincular con código de teléfono"**
   - Ingresa: **K-O-N-M-I-B-O-T**
   - ¡Listo! Aparecerá como "KONMI-BOT"

## 🚀 **VENTAJAS DEL PAIRING CODE**

✅ **Código fijo:** Siempre es "KONMIBOT"
✅ **No necesita cámara:** Se ingresa manualmente
✅ **Más tiempo:** 10 minutos vs 2 minutos del QR
✅ **Más seguro:** No se puede interceptar visualmente
✅ **Personalizado:** Aparece como "KONMI-BOT"

## 🔧 **COMANDOS DISPONIBLES**

```bash
# Inicio tradicional con QR
npm start

# Inicio con opciones
npm run start:options

# Solo QR
npm run start:qr

# Solo pairing (con menú)
npm run start:pairing
```

## ⚠️ **NOTAS IMPORTANTES**

1. **Modificación permanente:** El código "KONMIBOT" está modificado en Baileys
2. **Actualización de Baileys:** Si actualizas Baileys, perderás la modificación
3. **Backup:** Guarda los archivos modificados antes de actualizar
4. **Compatibilidad:** Funciona con todas las versiones actuales de WhatsApp

## 🎯 **ARCHIVOS MODIFICADOS**

- `node_modules/@whiskeysockets/baileys/lib/Socket/socket.js` (línea 539)
- `node_modules/@whiskeysockets/baileys/lib/Utils/validate-connection.js` (línea 20)
- `node_modules/@whiskeysockets/baileys/lib/Utils/browser-utils.js` (línea 21)

¡Ahora puedes conectar tu bot usando el código fijo "KONMIBOT"! 🎉

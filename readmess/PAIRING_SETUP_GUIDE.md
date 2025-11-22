# 🔗 KONMI BOT - Pairing Setup Guide

Este documento explica cómo configurar y conectar el KONMI BOT usando **nstar-y/bail** con QR Code o Custom Pairing Code.

## 📋 Contenido

1. [Método 1: QR Code (Recomendado)](#método-1-qr-code-recomendado)
2. [Método 2: Custom Pairing Code](#método-2-custom-pairing-code)
3. [Método 3: Pairing Interactivo](#método-3-pairing-interactivo)
4. [Configuración en .env](#configuración-en-env)
5. [Troubleshooting](#troubleshooting)

---

## Método 1: QR Code (Recomendado)

**Mejor para**: Pairing rápido y simple

### Pasos:

```bash
npm run pairing:qr
```

1. **Abre WhatsApp en tu teléfono**
2. **Navega a**: Configuración → Dispositivos vinculados → Vincular dispositivo
3. **Escanea el QR** mostrado en la terminal con la cámara de tu teléfono
4. **Espera a que se conecte** automáticamente

El bot guardará las credenciales en `storage/baileys_full/` y exitará automáticamente cuando se conecte.

### Características:
- ✅ Rápido y confiable
- ✅ No requiere entrada manual
- ✅ QR generado en terminal (con `printQRInTerminal: true`)
- ℹ️ QR también guardado en `storage/baileys_full/qr.txt`

---

## Método 2: Custom Pairing Code

**Mejor para**: Códigos personalizados (nstar-y/bail exclusive)

### Pasos:

```bash
npm run pairing:direct
```

1. **Ingresa tu número de teléfono** con código de país (ej: `595974154768`)
2. **Elige si quieres usar código personalizado** (y/n)
3. **Si eliges 'y'**: Ingresa tu código personalizado de 8 caracteres alfanuméricos
4. **Espera el código de vinculación** que aparecerá en la terminal
5. **En tu teléfono**:
   - Abre WhatsApp
   - Configuración → Dispositivos vinculados → Vincular con número
   - Ingresa el código mostrado

### Ejemplo de salida:

```
╔═══════════════════════════════════════════╗
║  ✅ PAIRING CODE GENERATED                ║
╠═══════════════════════════════════════════╣
║  📞 Phone: +595974154768                  ║
║  🔑 Custom: KONMIBOT                      ║
║  🔐 Code:   1234-5678-9012-3456          ║
║  ⏰ Valid for 10 minutes                   ║
╠═══════════════════════════════════════════╣
║  📱 On your phone:                        ║
║  1. Open WhatsApp                         ║
║  2. Settings > Linked devices             ║
║  3. Link with phone number                ║
║  4. Enter the code above                  ║
╚═══════════════════════════════════════════╝
```

### Características:
- 🔑 Código personalizado de 8 caracteres
- ♻️ 3 intentos automáticos si falla
- ⏰ Válido por 10 minutos
- 🔄 Reintentos automáticos

---

## Método 3: Pairing Interactivo

**Mejor para**: Elegir entre QR y Custom Pairing en la ejecución

### Pasos:

```bash
npm run pairing:interactive
```

1. **Selecciona el método**:
   - Opción 1: QR Code
   - Opción 2: Custom Pairing Code
2. **Sigue los pasos según el método elegido**

---

## Configuración en .env

### Variables de Pairing Personalizado

```env
# Pairing (principal)
# Código de emparejamiento personalizado (alfanumérico, 8 caracteres)
PAIRING_CODE=KONMIBOT

# Alternativas (cualquiera de estas funciona):
# PAIR_CODE=KONMIBOT
# PAIR_CUSTOM_CODE=KONMIBOT
# CUSTOM_PAIRING_CODE=KONMIBOT

# Enforzar numérico (solo dígitos 0-9)
PAIR_ENFORCE_NUMERIC=false

# Solo permitir pairing con código personalizado (no generar automático)
PAIRING_ONLY_CUSTOM=false
```

### Cómo funciona:

1. **Sin PAIRING_CODE en .env**: El script te pedirá el código interactivamente
2. **Con PAIRING_CODE en .env**: Se usará automáticamente
3. **PAIR_ENFORCE_NUMERIC=true**: Solo acepta dígitos (0-9) en vez de alfanuméricos

### Ejemplo completo:

```env
# .env
PAIRING_CODE=KONMIBOT
PAIR_ENFORCE_NUMERIC=false
PAIRING_ONLY_CUSTOM=false
WA_SESSION_NAME=baileys_full
```

---

## Después del Pairing

Una vez que el device esté vinculado, inicia el bot:

```bash
npm start
```

o en modo desarrollo:

```bash
npm run dev
```

### Credenciales guardadas en:

```
storage/baileys_full/
├── creds.json          # Credenciales cifradas
├── msgs.json           # Caché de mensajes
├── groupMetadata.json  # Info de grupos
└── app-state-sync-key/ # Claves de sincronización
```

---

## Troubleshooting

### ❌ "Error: Could not load Baileys module"

**Solución**: Asegúrate de que nstar-y/bail esté instalado:

```bash
npm install
npm list baileys
```

Debe mostrar: `baileys@npm:baileys-mod@6.8.5 (git+ssh://git@github.com/nstar-y/bail.git...)`

---

### ❌ "QR code not generated"

**Causas posibles**:
- Red sin conexión
- Puerto bloqueado
- Sesión anterior corrupta

**Soluciones**:

```bash
# Limpiar sesión anterior
rm -rf storage/baileys_full/

# Reintentar pairing
npm run pairing:qr
```

---

### ❌ "Pairing code timeout"

**Causas posibles**:
- No ingresaste el código en el teléfono en 10 minutos
- Código incorrecto
- Whatsapp necesita actualización

**Soluciones**:

```bash
# Vuelve a solicitar código (automáticamente reintentas 3 veces)
npm run pairing:direct
```

---

### ❌ "Phone number invalid"

**Solución**: Asegúrate de ingresar:
- Código de país completo
- Sin guiones ni espacios
- Ejemplo: `595974154768` (para Paraguay)

---

### ❌ "403 Forbidden - Device may be blocked"

**Causas**: WhatsApp bloqueó el device (probablemente por múltiples intentos fallidos)

**Soluciones**:

1. **Espera 24 horas** antes de reintentar
2. **Usa un número diferente**
3. **Verifica que WhatsApp esté actualizado** en el teléfono

---

## 🔐 Seguridad

### ✅ Buenas prácticas:

- **Nunca compartas tus credenciales** (archivos en `storage/baileys_full/`)
- **Usa código personalizado seguro** (no "12345678")
- **Mantén .env privado** (gitignore)
- **Actualiza regularmente** (`npm update`)

### ⚠️ PAIRING_CODE en .env:

El valor de `PAIRING_CODE` es **solo para uso local**:
- ✅ Se usa en el script de pairing
- ❌ NO se envía a WhatsApp
- ❌ No es una "contraseña" de WhatsApp
- ℹ️ WhatsApp genera el código real automáticamente

---

## 📊 Métodos Comparados

| Característica | QR Code | Custom Pairing Code | Interactivo |
|---|---|---|---|
| **Velocidad** | ⚡ Rápido | ⚡ Rápido | ⚡ Rápido |
| **Facilidad** | 😊 Muy fácil | 😊 Fácil | 😊 Muy fácil |
| **Código personalizado** | ❌ No | ✅ Sí | ✅ Sí (opcional) |
| **Entrada manual** | ❌ No | ✅ Sí | ✅ Sí (opcional) |
| **Tiempo de validez** | ∞ Hasta escanear | 10 min | Variable |
| **Reintentos** | Automático | 3 intentos | Variable |

---

## 📞 Comandos Disponibles

```bash
# QR Code pairing
npm run pairing:qr

# Custom pairing code
npm run pairing:direct

# Pairing interactivo (elige)
npm run pairing:interactive

# Iniciar bot (después del pairing)
npm start

# Modo desarrollo (con hot reload)
npm run dev
```

---

## 🚀 Próximos Pasos

1. ✅ Ejecuta el pairing script
2. ✅ Vincula tu dispositivo
3. ✅ Inicia el bot con `npm start`
4. ✅ Prueba los comandos (ej: `/help`, `/music`, `/video`)

---

## 📚 Referencias

- **GitHub**: https://github.com/nstar-y/bail
- **Baileys Original**: https://github.com/WhiskeySockets/Baileys
- **WhatsApp Security**: https://www.whatsapp.com/security

---

## ❓ Preguntas Frecuentes

**P: ¿Cuál es la diferencia entre QR y Pairing Code?**  
R: QR es más rápido; Pairing Code permite códigos personalizados.

**P: ¿Se puede cambiar el código personalizado después?**  
R: No. Debes hacer pairing nuevamente con otro código.

**P: ¿Es seguro usar 'KONMIBOT' como código?**  
R: Sí, solo lo ves tú en la terminal. WhatsApp genera el código real.

**P: ¿Qué pasa si se desconecta?**  
R: El bot intentará reconectarse automáticamente.

**P: ¿Puedo usar el bot en múltiples chats?**  
R: Sí, el bot funciona en DM, grupos y canales.

---

**Última actualización**: 2025-11-19  
**Versión**: KONMI BOT v2.5.0 con nstar-y/bail v6.8.5

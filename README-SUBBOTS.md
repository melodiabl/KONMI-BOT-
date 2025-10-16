# 🤖 SISTEMA DE SUBBOTS - KONMI BOT

## 📱 Comandos Disponibles

### Solo 2 comandos necesarios:

```
/qr     → Genera código QR (imagen)
/code   → Genera código de vinculación (8 dígitos)
```

**💡 Importante:** Ambos comandos NO requieren parámetros. Son completamente automáticos.

---

## 🚀 Uso

### 1️⃣ Crear subbot con QR

```
Usuario: /qr
```

**El bot responde con:**
- 📱 Imagen del código QR
- ℹ️ Instrucciones paso a paso
- ⏱️ Tiempo de expiración (60 segundos)

**Pasos:**
1. Abre WhatsApp en tu celular
2. Ve a **Dispositivos vinculados**
3. Toca **Vincular dispositivo**
4. Escanea el QR que te envió el bot

---

### 2️⃣ Crear subbot con código

```
Usuario: /code
```

**El bot responde con:**
- 🔢 Código de 8 dígitos (ejemplo: 12345678)
- 📱 Tu número (detectado automáticamente)
- ℹ️ Instrucciones paso a paso
- ⏳ Tiempo de expiración (10 minutos)

**Pasos:**
1. Abre WhatsApp en el dispositivo
2. Ve a **Dispositivos vinculados**
3. Toca **Vincular dispositivo**
4. Selecciona **Vincular con número de teléfono**
5. Ingresa el código de 8 dígitos

---

## 🗑️ Auto-Limpieza

### ¿Qué es?

El sistema **elimina automáticamente** los subbots cuando se desconectan de WhatsApp.

### ¿Qué se elimina?

```
✅ Carpeta del subbot (storage/subbots/[código]/)
✅ Registro en la base de datos
✅ Todos los archivos de sesión
```

### ¿Cuándo se activa?

- Usuario desvincula el bot desde WhatsApp
- Timeout sin conexión (1 minuto)
- Logout del subbot
- Error permanente

### ⏱️ Tiempo de limpieza

**5 segundos** después de detectar la desconexión.

---

## 📊 Límites

```
Máximo: 3 subbots por usuario
```

Si alcanzas el límite:
- Desvincula uno desde WhatsApp
- Espera 5-10 segundos
- El sistema lo eliminará automáticamente
- Podrás crear uno nuevo

---

## ✨ Ventajas

### Para usuarios:
- ✅ Solo 2 comandos simples
- ✅ No necesitas escribir números
- ✅ No necesitas comandos de borrar
- ✅ Todo es automático

### Para el sistema:
- ✅ Sin carpetas huérfanas
- ✅ Base de datos limpia
- ✅ Recursos optimizados
- ✅ Sin mantenimiento manual

---

## 📝 Ejemplo Completo

```
👤 Usuario: /code

🤖 Bot: ╔═══════════════════════════════════╗
       ║  🔢 CÓDIGO DE VINCULACIÓN         ║
       ╚═══════════════════════════════════╝
       
       ✅ Subbot creado exitosamente
       
       📊 INFORMACIÓN
       ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
       📱 Número: +595981234567
       🔢 Código: 12345678
       ⏳ Válido por: 10 minutos
       
       [Instrucciones completas...]
       
       🔄 AUTO-LIMPIEZA ACTIVADA

👤 Usuario: [Ingresa código en WhatsApp]

🤖 Bot: ✅ Subbot conectado

👤 Usuario: [Desvincula desde WhatsApp después de usar]

🤖 Sistema: [Auto-limpia en 5 segundos]
           🗑️ Carpeta eliminada
           🗑️ Registro eliminado
           ✅ Sistema limpio
```

---

## ❓ Preguntas Frecuentes

### ¿Necesito escribir mi número con /code?
❌ **NO**. El sistema detecta tu número automáticamente.

### ¿Cómo elimino un subbot?
❌ **No necesitas comandos**. Solo desvincula desde WhatsApp y se elimina automáticamente.

### ¿Qué pasa si alcanzo el límite de 3?
💡 Desvincula uno desde WhatsApp y espera 5-10 segundos. Se limpiará automáticamente.

### ¿El QR expira?
✅ **Sí**, en 60 segundos. Usa `/qr` nuevamente si expira.

### ¿El código expira?
✅ **Sí**, en 10 minutos. Usa `/code` nuevamente si expira.

---

## 🛠️ Tecnología

- **baileys-mod** para pairing codes personalizados
- **Auto-limpieza** en `subbot-manager.js`
- **Comandos mejorados** en `whatsapp.js`
- **PostgreSQL/SQLite** para base de datos

---

## 📞 Soporte

Si tienes problemas:
1. Verifica que tu número esté registrado correctamente
2. Intenta nuevamente el comando
3. Contacta al administrador

---

## ✨ Resumen

```
┌─────────────────────────────────────┐
│  🤖 SISTEMA DE SUBBOTS AUTOMATIZADO │
├─────────────────────────────────────┤
│                                     │
│  📱 Solo 2 comandos: /qr y /code   │
│  🗑️ Auto-limpieza al desconectar   │
│  ✅ Sin comandos de borrar          │
│  🔢 Sin escribir números            │
│  ⚡ Todo automático                 │
│                                     │
└─────────────────────────────────────┘
```

---

*KONMI BOT Panel v2.5.0*  
*Sistema de Subbots Automatizado v3.0*  
*2024*

✨ **¡Simple, automático y profesional!** ✨
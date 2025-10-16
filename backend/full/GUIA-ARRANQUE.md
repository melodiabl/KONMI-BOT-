# 🚀 Guía de Arranque Rápido - Sistema Bot WhatsApp Panel v2.5

## 📋 Requisitos Previos

### Software Necesario
- ✅ **Node.js** v16+ (Recomendado: v22.19.0 o superior)
- ✅ **npm** o **yarn**
- ✅ **Git** (opcional, para actualizaciones)

### Verificar Instalación
```bash
node --version
npm --version
```

---

## 🔧 Pasos de Configuración Inicial

### 1️⃣ Instalar Dependencias

Navega a la carpeta del backend:
```bash
cd C:\Users\kangu\Documents\bot-whatsapp-panel-2.5-completo-v2\backend\full
```

Instala las dependencias:
```bash
npm install
```

### 2️⃣ Verificar Base de Datos

La base de datos SQLite debería estar en `storage/database.sqlite`. Verifica las tablas:
```bash
node list-tables.js
```

**Tablas requeridas:**
- ✅ `subbots` - Para gestión de subbots
- ✅ `usuarios` - Para autenticación
- ✅ `grupos_autorizados` - Para control de acceso
- ✅ `aportes`, `pedidos`, `votaciones` - Funcionalidades del bot
- ✅ `bot_global_state` - Estado global del bot
- ✅ Y otras...

### 3️⃣ Verificar Estructura de Carpetas

Asegúrate que existan estas carpetas:
```bash
mkdir -p storage/logs
mkdir -p storage/subbots
mkdir -p storage/sessions
mkdir -p storage/baileys_full
mkdir -p storage/media
mkdir -p storage/downloads
```

### 4️⃣ Configurar Variables de Entorno

El archivo `.env` ya existe. Verifica que contenga al menos:

```env
# Puerto del servidor
PORT=3000

# Base de datos
DB_TYPE=sqlite
DB_PATH=./storage/database.sqlite

# JWT Secret (para autenticación)
JWT_SECRET=tu_clave_secreta_aqui

# Log Level
LOG_LEVEL=info
LOG_TO_FILE=true

# Frontend URL
FRONTEND_URL=http://localhost:5173

# API Keys (opcional)
GEMINI_API_KEY=tu_api_key_aqui
```

---

## 🎯 Arrancar el Sistema

### Método 1: Modo Producción
```bash
npm start
```

### Método 2: Modo Desarrollo (con auto-reload)
```bash
npm run dev
```

---

## 📊 Banner de Inicio Esperado

Al arrancar correctamente, deberías ver:

```
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║  🤖 KONMI BOT - Sistema Multi-Bot Avanzado v2.5.0        ║
║  ✨ Panel de Administración y Control                     ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝

[2025-01-XX XX:XX:XX] 🚀 [Servidor] Backend iniciado en puerto 3000
[2025-01-XX XX:XX:XX] 🌐 [Servidor] Host: 0.0.0.0
[2025-01-XX XX:XX:XX] 📦 [Servidor] Entorno: development
[2025-01-XX XX:XX:XX] 🎨 [Frontend] URL: http://localhost:5173
[2025-01-XX XX:XX:XX] 🤖 [Bot] KONMI BOT v2.5.0

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Sistema listo para recibir conexiones
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## 📱 Conectar WhatsApp

### Primera Vez - Menú Interactivo

El sistema te preguntará cómo quieres conectar:

```
╔════════════════════════════════════════════════╗
║     🔐 Método de Emparejamiento WhatsApp      ║
╚════════════════════════════════════════════════╝

Selecciona cómo deseas conectar el bot:

1) 📱 Código QR (escanea desde WhatsApp)
2) 🔢 Código de emparejamiento (8 dígitos)

Ingresa tu selección (1 o 2):
```

#### Opción 1: Código QR
1. Selecciona opción `1`
2. Aparecerá un código QR en la terminal
3. Abre WhatsApp en tu teléfono
4. Ve a **Dispositivos Vinculados** > **Vincular Dispositivo**
5. Escanea el código QR
6. ✅ ¡Conectado!

#### Opción 2: Código de Emparejamiento
1. Selecciona opción `2`
2. Ingresa tu número de teléfono (con código de país, ej: `573001234567`)
3. Recibirás un código de 8 dígitos en la terminal (ej: `XXXX-XXXX`)
4. Abre WhatsApp en tu teléfono
5. Ve a **Dispositivos Vinculados** > **Vincular Dispositivo**
6. Selecciona **Vincular con número de teléfono**
7. Ingresa el código mostrado
8. ✅ ¡Conectado!

---

## 🤖 Comandos de Subbots (WhatsApp)

Una vez conectado el bot principal, puedes crear subbots:

### Crear Subbot con QR
Envía al bot principal por WhatsApp:
```
/qr
```

El bot te responderá con:
- ✅ Una imagen del código QR
- 📝 Instrucciones para escanear
- 🔗 Un código único para el subbot

**Escanea el QR desde otro WhatsApp para vincular el subbot.**

### Crear Subbot con Código
Envía al bot principal por WhatsApp:
```
/code
```

El bot detectará automáticamente tu número y te enviará:
- ✅ Un código de emparejamiento de 8 dígitos
- 📝 Instrucciones detalladas
- 🔗 Un código único para el subbot

**Ingresa el código en WhatsApp para vincular el subbot.**

---

## 🧹 Auto-Limpieza de Subbots

### Comportamiento Automático

Cuando un subbot se desconecta:

1. ⏱️ Espera 5 segundos
2. 🗑️ Elimina la carpeta `storage/subbots/[codigo]/`
3. 🗄️ Elimina el registro de la base de datos
4. 📋 Registra la limpieza en logs

**No necesitas intervención manual para limpiar subbots desconectados.**

---

## 📊 Logs del Sistema

### Ubicación de Logs
- **Consola:** Salida estándar con emojis y formato estructurado
- **Archivo:** `storage/logs/app.log` (si `LOG_TO_FILE=true`)

### Tipos de Logs

#### 🤖 Logs de WhatsApp
```
[WhatsApp] 📱 Conectado exitosamente
[WhatsApp] 📞 Recibiendo llamada de 573001234567
[WhatsApp] 💬 Mensaje recibido de 573001234567
```

#### 🔧 Logs de Subbots
```
[Subbot] 🆕 Creando subbot [ABC123]
[Subbot] ✅ Subbot [ABC123] conectado
[Subbot] 🔌 Subbot [ABC123] desconectado
[Subbot] 🧹 Limpiando subbot [ABC123]
```

#### 🗄️ Logs de Base de Datos
```
[Database] 💾 Guardando aporte #123
[Database] ✅ Usuario actualizado: john_doe
[Database] ❌ Error al insertar: duplicate key
```

---

## 🔍 Verificar Estado del Sistema

### 1. API Health Check
```bash
curl http://localhost:3000/api/health
```

Respuesta esperada:
```json
{
  "status": "ok",
  "timestamp": "2025-01-XX...",
  "uptime": 123.45,
  "environment": "development"
}
```

### 2. Estado de WhatsApp
```bash
curl http://localhost:3000/api/whatsapp/status \
  -H "Authorization: Bearer TU_TOKEN_JWT"
```

### 3. Lista de Subbots
```bash
curl http://localhost:3000/api/subbots \
  -H "Authorization: Bearer TU_TOKEN_JWT"
```

---

## 🛠️ Solución de Problemas

### Problema: "Cannot find module..."
**Solución:**
```bash
npm install
```

### Problema: "Port 3000 is already in use"
**Solución:**
1. Cambia el puerto en `.env`:
   ```env
   PORT=3001
   ```
2. O mata el proceso que usa el puerto:
   ```bash
   # Windows
   netstat -ano | findstr :3000
   taskkill /PID <PID> /F
   ```

### Problema: "Database locked"
**Solución:**
1. Cierra todas las instancias del bot
2. Elimina el archivo de lock:
   ```bash
   rm storage/database.sqlite-shm
   rm storage/database.sqlite-wal
   ```

### Problema: QR no aparece
**Solución:**
1. Verifica que el terminal soporte caracteres Unicode
2. Usa un terminal moderno (Windows Terminal, iTerm2, etc.)
3. Si persiste, usa el método de código de emparejamiento

### Problema: "ECONNREFUSED" al conectar WhatsApp
**Solución:**
1. Verifica tu conexión a internet
2. Desactiva VPN/Proxy temporalmente
3. Verifica firewall/antivirus

---

## 🔐 Seguridad

### Recomendaciones

1. **JWT Secret:** Cambia `JWT_SECRET` en `.env` a un valor único y seguro
2. **Usuarios:** Crea usuarios con contraseñas fuertes
3. **API Keys:** No compartas tus claves de Gemini u otras APIs
4. **Logs:** Los logs pueden contener información sensible, protege `storage/logs/`
5. **Base de Datos:** Haz backups regulares de `storage/database.sqlite`

---

## 📚 Recursos Adicionales

### Documentación
- `README.md` - Documentación general del proyecto
- `README-SUBBOTS.md` - Guía detallada de subbots
- `README-MELODIA.md` - Integración con Melodia (descarga de música)
- `CAMBIOS-FINALES.md` - Últimos cambios implementados

### Scripts Útiles
- `list-tables.js` - Lista todas las tablas de la BD
- `check-subbots.js` - Verifica estado de subbots
- `backup-db.js` - Crea backup de la base de datos
- `create-users.js` - Crea usuarios para el panel

---

## ✅ Checklist de Arranque

Antes de usar el sistema en producción:

- [ ] Dependencias instaladas (`npm install`)
- [ ] Base de datos verificada (`node list-tables.js`)
- [ ] Carpetas de storage creadas
- [ ] Variables de entorno configuradas (`.env`)
- [ ] Bot principal conectado a WhatsApp
- [ ] Probado crear subbot con `/qr`
- [ ] Probado crear subbot con `/code`
- [ ] Verificada auto-limpieza de subbots
- [ ] Logs funcionando correctamente
- [ ] API respondiendo (health check)
- [ ] Frontend conectado (si aplica)

---

## 📞 Soporte

Si encuentras problemas:

1. Revisa los logs en `storage/logs/app.log`
2. Verifica que todos los servicios estén corriendo
3. Consulta la documentación adicional
4. Revisa los issues conocidos en el repositorio

---

## 🎉 ¡Listo para Usar!

Una vez completados todos los pasos, tu sistema estará 100% funcional:

✅ Bot principal conectado
✅ Subbots creables con `/qr` y `/code`
✅ Auto-limpieza funcionando
✅ Logs profesionales
✅ API lista
✅ Panel de control (si lo tienes configurado)

**¡Disfruta de tu bot WhatsApp multi-instancia! 🚀**

---

**Versión:** 2.5.0  
**Última actualización:** Enero 2025  
**Autor:** Sistema KONMI BOT
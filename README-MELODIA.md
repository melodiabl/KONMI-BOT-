# 🎵 Melodia Bot - WhatsApp Bot Admin

Un bot de WhatsApp completo con sistema de administración, sub-bots, comandos de IA y entretenimiento.

## ✨ Características Principales

### 🤖 **Sistema de Sub-bots**
- Crear y gestionar múltiples sub-bots
- Generación automática de QR para vinculación
- Comandos básicos en cada sub-bot
- Monitoreo de estado en tiempo real

### 🧹 **Gestión de Sesiones**
- Limpiar sesiones de WhatsApp vinculadas
- Regenerar QR automáticamente
- Limpieza de archivos temporales
- Reinicio automático del bot

### 🤖 **Comandos de IA**
- Chat con IA usando Gemini
- Generación de imágenes con IA
- Traducción de texto
- Respuestas contextuales y personalizadas

### 🎵 **Comandos de Media**
- Descarga de música de YouTube
- Búsqueda de wallpapers
- Generación de memes
- Chistes y citas inspiracionales

### 🎮 **Entretenimiento**
- Trivia y preguntas
- Horóscopos personalizados
- Datos curiosos
- Clima de ciudades

### 📊 **Sistema de Logs**
- Logs detallados de todas las acciones
- Estadísticas del bot
- Exportación de logs (JSON, CSV, TXT)
- Categorización de eventos

## 🚀 Instalación

### 1. Clonar el repositorio
```bash
git clone <repository-url>
cd bot-whatsapp-panel-2.5-completo-v2
```

### 2. Instalar dependencias
```bash
./install-dependencies.sh
```

### 3. Configurar variables de entorno
```bash
cp .env.example .env
# Editar .env con tus configuraciones
```

### 4. Configurar base de datos
```bash
# Crear base de datos PostgreSQL
createdb melodia_bot

# Ejecutar migraciones
npm run migrate
```

### 5. Iniciar el bot
```bash
npm start
```

## 📋 Comandos Disponibles

### 👑 **Comandos de Administrador**
- `/serbot` - Crear nuevo sub-bot
- `/bots` - Listar todos los sub-bots
- `/delsubbot ` - Eliminar sub-bot
- `/qr - Obtener QR del sub-bot
- `/cleansession` - Limpiar sesiones y generar QR
- `/logs [tipo]` - Ver logs del sistema
- `/stats` - Estadísticas del bot
- `/export <formato>` - Exportar logs

### 🤖 **Comandos de IA**
- `/ai <pregunta>` - Chat con IA de Melodia
- `/image <descripción>` - Generar imagen con IA
- `/translate <texto> <idioma>` - Traducir texto

### 🎵 **Comandos de Media**
- `/music <canción>` - Descargar música de YouTube
- `/meme` - Obtener meme aleatorio
- `/wallpaper <tema>` - Wallpaper por tema

### 🎮 **Comandos de Entretenimiento**
- `/joke` - Obtener chiste aleatorio
- `/quote` - Cita inspiracional
- `/fact` - Dato curioso
- `/trivia` - Pregunta de trivia
- `/horoscope <signo>` - Horóscopo del día
- `/weather <ciudad>` - Clima de una ciudad

### 🔧 **Comandos de Utilidad**
- `/miinfo` - Tu información de usuario
- `/help [categoría]` - Mostrar ayuda
- `/estado` - Estado del bot

## 🏗️ Estructura del Proyecto

```
bot-whatsapp-panel-2.5-completo-v2/
├── backend/
│   └── full/
│       ├── commands.js              # Comandos básicos
│
│       ├── whatsapp.js              # Handler principal
│       └── index.js                 # Servidor principal

├── frontend-panel/                  # Panel web (opcional)
└── install-dependencies.sh          # Script de instalación
```

## 🔧 Configuración

### Variables de Entorno Requeridas
```env
# Bot
BOT_NAME=Melodia
BOT_VERSION=1.0.0
BOT_AUTHOR=Melodia

# Base de datos
DB_HOST=localhost
DB_PORT=5432
DB_NAME=melodia_bot
DB_USER=postgres
DB_PASSWORD=password

# APIs externas
OPENWEATHER_API_KEY=your_key_here
UNSPLASH_ACCESS_KEY=your_key_here
GEMINI_API_KEY=your_key_here

# Servidor
PORT=3001
NODE_ENV=development
```

## 🤖 Sistema de Sub-bots

### Crear Sub-bot
```bash
# En WhatsApp
/serbot
```

### Gestionar Sub-bots
```bash
# Listar sub-bots
/bots

# Eliminar sub-bot
/delsubbot subbot_1234567890_abc123

# Obtener QR
/qr subbot_1234567890_abc123
```

## 📊 Sistema de Logs

### Ver Logs
```bash
# Todos los logs
/logs

# Logs por categoría
/logs errors
/logs commands
/logs users
/logs system
```

### Exportar Logs
```bash
# Exportar en diferentes formatos
/export json
/export csv
/export txt
```

## 🎵 Personalización

El bot está completamente personalizado con el estilo de **Melodia**:
- Mensajes con formato especial
- Emojis y personalidad única
- Respuestas contextuales
- Interfaz amigable

## 🚨 Solución de Problemas

### Error de conexión a WhatsApp
```bash
# Limpiar sesiones y regenerar QR
/cleansession
```

### Error de base de datos
```bash
# Verificar conexión
npm run test-db

# Ejecutar migraciones
npm run migrate
```

### Error de dependencias
```bash
# Reinstalar dependencias
./install-dependencies.sh
```

## 📝 Licencia

Este proyecto está bajo la licencia MIT. Ver `LICENSE` para más detalles.

## 👥 Contribuciones

Las contribuciones son bienvenidas. Por favor:
1. Fork el proyecto
2. Crea una rama para tu feature
3. Commit tus cambios
4. Push a la rama
5. Abre un Pull Request

## 📞 Soporte

Para soporte o preguntas:
- Abre un issue en GitHub
- Contacta al autor: Melodia
- Revisa la documentación

---

**🎵 Hecho con 💫 por Melodia**

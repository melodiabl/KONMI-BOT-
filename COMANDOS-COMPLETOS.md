# 📚 Guía Completa de Comandos - KONMI BOT v2.5.0

## 🎯 Índice

- [Comandos Básicos](#comandos-básicos)
- [Inteligencia Artificial](#inteligencia-artificial)
- [Descargas de Redes Sociales](#descargas-de-redes-sociales)
- [Música y Multimedia](#música-y-multimedia)
- [Utilidades](#utilidades)
- [Aportes y Contenido](#aportes-y-contenido)
- [Administración de Grupos](#administración-de-grupos)
- [Sistema y Configuración](#sistema-y-configuración)
- [Subbots](#subbots)
- [APIs Utilizadas](#apis-utilizadas)

---

## 🧪 Comandos Básicos

### `/test`
Verifica que el bot esté funcionando correctamente.

**Uso:**
```
/test
```

**Respuesta:**
✅ Bot funcionando correctamente

---

### `/help` o `/ayuda` o `/menu` o `/comandos`
Muestra la lista completa de comandos disponibles.

**Uso:**
```
/help
```

---

### `/ping`
Verifica la latencia y estado de conexión del bot.

**Uso:**
```
/ping
```

---

### `/status` o `/info`
Muestra información del servidor, CPU, RAM y estado del sistema.

**Uso:**
```
/status
```

**Información mostrada:**
- 🖥️ Sistema operativo
- 💻 CPU y RAM
- ⏰ Uptime del servidor
- 📊 Estado de conexión

---

### `/whoami`
Muestra tu información de usuario en el sistema.

**Uso:**
```
/whoami
```

---

## 🤖 Inteligencia Artificial

### `/ia [pregunta]` o `/ai [pregunta]`
Realiza preguntas a la IA (Gemini AI).

**Uso:**
```
/ia ¿Qué es JavaScript?
/ai Explícame la teoría de la relatividad
```

**API utilizada:** Google Gemini AI
**Requisito:** Variable de entorno `GEMINI_API_KEY` configurada

---

### `/clasificar [texto]`
Clasifica contenido automáticamente usando IA.

**Uso:**
```
/clasificar Este manhwa es sobre un héroe que...
```

**Funcionalidad:**
- Analiza el contenido con IA
- Clasifica por tipo (manhwa, serie, anime, etc.)
- Extrae información relevante

---

### `/listclasificados`
Muestra la lista de contenido clasificado automáticamente.

**Uso:**
```
/listclasificados
```

---

## 📥 Descargas de Redes Sociales

Todos estos comandos incluyen **sistema de fallback automático** con múltiples APIs.

### `/tiktok [URL]` o `/tt [URL]`
Descarga videos de TikTok sin marca de agua.

**Uso:**
```
/tiktok https://www.tiktok.com/@user/video/123456789
```

**APIs utilizadas (con fallback):**
1. TikWM API (https://tikwm.com)
2. Vreden API (https://api.vreden.my.id)
3. DownloaderBot API (https://downloaderbot.my.id)

**Información descargada:**
- 📹 Video sin marca de agua
- 👤 Autor del video
- 📝 Descripción
- 🎵 Música usada

---

### `/instagram [URL]` o `/ig [URL]`
Descarga fotos, videos y reels de Instagram.

**Uso:**
```
/instagram https://www.instagram.com/p/ABC123/
/ig https://www.instagram.com/reel/XYZ789/
```

**APIs utilizadas (con fallback):**
1. Vreden API
2. DownloaderBot API

**Soporta:**
- 📸 Fotos
- 🎥 Videos
- 🎬 Reels
- 📱 Stories

---

### `/facebook [URL]` o `/fb [URL]`
Descarga videos de Facebook.

**Uso:**
```
/facebook https://www.facebook.com/watch/?v=123456789
```

**APIs utilizadas (con fallback):**
1. Vreden API
2. DownloaderBot API

---

### `/twitter [URL]` o `/x [URL]`
Descarga videos e imágenes de Twitter/X.

**Uso:**
```
/twitter https://twitter.com/user/status/123456789
/x https://x.com/user/status/123456789
```

**APIs utilizadas (con fallback):**
1. Vreden API
2. DownloaderBot API

**Soporta:**
- 🎥 Videos
- 📸 Imágenes
- 🧵 Threads

---

### `/pinterest [URL]` o `/pin [URL]`
Descarga imágenes de Pinterest en alta calidad.

**Uso:**
```
/pinterest https://www.pinterest.com/pin/123456789/
```

**APIs utilizadas (con fallback):**
1. Vreden API
2. PinterestDownloader API

---

## 🎵 Música y Multimedia

### `/music [búsqueda]` o `/musica [búsqueda]`
Busca y descarga música de YouTube en formato MP3.

**Uso:**
```
/music Despacito Luis Fonsi
/musica Shape of You
```

**Proceso:**
1. 🔎 Busca en YouTube
2. ⬇️ Descarga el audio en MP3
3. 📤 Envía el archivo

**APIs utilizadas:**
- YouTube Search API (Vreden)
- YouTube Download API (ytdl)

**Información incluida:**
- 🎵 Título de la canción
- 👤 Canal/Artista
- ⏱️ Duración
- 👁️ Número de vistas
- 📶 Calidad del audio

---

### `/video [búsqueda]` o `/youtube [búsqueda]`
Busca y descarga videos de YouTube.

**Uso:**
```
/video Tutorial de JavaScript
/youtube Como cocinar pasta
```

**APIs utilizadas:**
- YouTube Search API
- YouTube Download API

---

### `/spotify [búsqueda]` o `/spot [búsqueda]`
Busca música en Spotify y la descarga.

**Uso:**
```
/spotify Blinding Lights The Weeknd
```

**APIs utilizadas:** Vreden Spotify API

**Información mostrada:**
- 🎶 Título y artista
- 💽 Álbum
- ⏱️ Duración
- 📅 Fecha de lanzamiento
- 🖼️ Portada del álbum

---

### `/play [canción]`
Busca y reproduce una canción (similar a /music).

**Uso:**
```
/play Thunder - Imagine Dragons
```

---

## 🔧 Utilidades

### `/translate [texto] | [idioma]` o `/traducir`
Traduce texto a cualquier idioma.

**Uso:**
```
/translate Hello world
/translate Hola mundo | en
/traducir Bonjour | es
```

**APIs utilizadas (con fallback):**
1. LibreTranslate API (https://libretranslate.de)
2. MyMemory Translate API

**Idiomas soportados:**
- `es` - Español
- `en` - Inglés
- `fr` - Francés
- `de` - Alemán
- `it` - Italiano
- `pt` - Portugués
- `ja` - Japonés
- `ko` - Coreano
- `zh` - Chino
- `ar` - Árabe
- `ru` - Ruso
- Y muchos más...

**Características:**
- ✅ Detección automática del idioma
- 🌍 Traducción instantánea
- 🎯 Alta precisión

---

### `/weather [ciudad]` o `/clima [ciudad]`
Obtiene el clima actual de cualquier ciudad.

**Uso:**
```
/weather Madrid
/clima Buenos Aires
/weather Tokyo
```

**APIs utilizadas (con fallback):**
1. Open-Meteo API (https://open-meteo.com)
2. WTTRin Weather API (https://wttr.in)

**Información mostrada:**
- 🌡️ Temperatura actual
- 💧 Humedad
- 💨 Velocidad del viento
- ☁️ Descripción del clima
- 📍 País y ciudad

---

### `/quote` o `/frase`
Obtiene una frase inspiradora aleatoria.

**Uso:**
```
/quote
/frase
```

**APIs utilizadas (con fallback):**
1. Quotable API (https://quotable.io)
2. ZenQuotes API (https://zenquotes.io)

---

### `/fact` o `/dato`
Obtiene un dato curioso aleatorio.

**Uso:**
```
/fact
/dato
```

**APIs utilizadas (con fallback):**
1. Useless Facts API
2. API Ninjas Facts

---

### `/trivia`
Obtiene una pregunta de trivia con opciones múltiples.

**Uso:**
```
/trivia
```

**API utilizada:** Open Trivia Database (https://opentdb.com)

**Incluye:**
- ❓ Pregunta
- 📚 Categoría
- ⭐ Nivel de dificultad
- ✅ Respuesta correcta (oculta)

---

### `/meme`
Obtiene un meme aleatorio de Reddit.

**Uso:**
```
/meme
```

**APIs utilizadas (con fallback):**
1. Meme API (https://meme-api.com)
2. ImgFlip API (https://imgflip.com)

---

### `/joke` o `/chiste`
Obtiene un chiste aleatorio.

**Uso:**
```
/joke
/chiste
```

---

### `/qr [texto]`
Genera un código QR con el texto proporcionado.

**Uso:**
```
/qr https://ejemplo.com
/qr Hola mundo
```

---

## 📝 Aportes y Contenido

### `/aportes`
Muestra la lista de aportes disponibles.

**Uso:**
```
/aportes
```

---

### `/myaportes`
Muestra tus aportes personales.

**Uso:**
```
/myaportes
```

---

### `/addaporte [contenido]`
Agrega un nuevo aporte al sistema.

**Uso:**
```
/addaporte Nuevo manhwa: Solo Leveling
```

**Soporta:**
- 📝 Texto
- 🖼️ Imágenes
- 🎥 Videos
- 📄 Documentos

---

### `/aporteestado [id] [estado]`
Cambia el estado de un aporte (admin).

**Uso:**
```
/aporteestado 123 aprobado
/aporteestado 456 rechazado
```

**Estados disponibles:**
- `pendiente`
- `aprobado`
- `rechazado`
- `en_revision`

---

### `/manhwas`
Lista de manhwas disponibles.

**Uso:**
```
/manhwas
```

---

### `/addmanhwa [título|género|descripción]`
Agrega un nuevo manhwa.

**Uso:**
```
/addmanhwa Solo Leveling | Acción, Fantasía | Un cazador de rango E...
```

---

### `/series`
Lista de series disponibles.

**Uso:**
```
/series
```

---

## 🛡️ Administración de Grupos

### `/kick @usuario`
Expulsa a un usuario del grupo (requiere admin).

**Uso:**
```
/kick @usuario
```

---

### `/promote @usuario`
Promueve a un usuario a administrador (requiere admin).

**Uso:**
```
/promote @usuario
```

---

### `/demote @usuario`
Remueve permisos de administrador (requiere admin).

**Uso:**
```
/demote @usuario
```

---

### `/lock`
Bloquea el grupo para que solo admins puedan escribir.

**Uso:**
```
/lock
```

---

### `/unlock`
Desbloquea el grupo.

**Uso:**
```
/unlock
```

---

### `/tag [mensaje]`
Menciona a todos los miembros del grupo.

**Uso:**
```
/tag Reunión importante a las 5 PM
```

---

## ⚙️ Sistema y Configuración

### `/logs [categoria]`
Muestra los registros del sistema (admin).

**Uso:**
```
/logs
/logs control
/logs configuracion
/logs sistema
```

**Categorías disponibles:**
- `control` - Acciones de control
- `configuracion` - Cambios de configuración
- `sistema` - Eventos del sistema
- `comando` - Comandos ejecutados
- `ai_command` - Comandos de IA
- `clasificar_command` - Comandos de clasificación

---

### `/config [parametro] [valor]`
Configura parámetros del bot (admin).

**Uso:**
```
/config bot_nombre KONMI BOT
/config max_usuarios 100
/config modo_mantenimiento false
```

**Parámetros comunes:**
- `bot_nombre` - Nombre del bot
- `prefijo_comando` - Prefijo de comandos
- `modo_mantenimiento` - Activa/desactiva mantenimiento
- `max_usuarios` - Límite de usuarios
- `idioma` - Idioma del bot

---

### `/registrar [username]`
Registra un nuevo usuario en el panel web.

**Uso:**
```
/registrar juan123
```

**Proceso:**
1. Registra tu username
2. Genera contraseña automática
3. Envía credenciales por privado

---

### `/resetpass [username]`
Resetea la contraseña de un usuario (admin).

**Uso:**
```
/resetpass juan123
```

---

### `/miinfo`
Muestra tu información de usuario.

**Uso:**
```
/miinfo
```

**Información mostrada:**
- 👤 Username
- 📱 Número de WhatsApp
- 🎭 Rol (usuario, admin, owner)
- 📅 Fecha de registro

---

### `/cleansession`
Limpia las sesiones del bot (admin).

**Uso:**
```
/cleansession
```

⚠️ **Advertencia:** Esto cerrará la sesión actual del bot.

---

### `/stats` o `/estadisticas`
Muestra estadísticas del bot.

**Uso:**
```
/stats
```

**Información mostrada:**
- 📊 Total de usuarios
- 💬 Total de mensajes procesados
- 📝 Total de aportes
- 🤖 Subbots activos
- ⏱️ Uptime

---

## 🤖 Subbots

Los subbots permiten gestionar múltiples instancias de WhatsApp desde un solo panel.

### `/qr` o `/subqr`
Genera código QR para vincular un subbot (owner).

**Uso:**
```
/qr
```

**Proceso:**
1. Genera código QR
2. Escanea con WhatsApp
3. Subbot se conecta automáticamente

---

### `/code [número]` o `/subcode [número]`
Genera código de vinculación por número (owner).

**Uso:**
```
/code 5491234567890
/code +54 9 11 2345-6789
```

**Proceso:**
1. Genera código de 8 dígitos
2. Ingresa en WhatsApp > Dispositivos vinculados
3. Subbot se conecta automáticamente

---

### `/subbots` o `/bots`
Lista todos los subbots y su estado (owner).

**Uso:**
```
/subbots
```

**Información mostrada:**
- 🆔 Código del subbot
- 📱 Número vinculado
- ✅ Estado (conectado/desconectado)
- 📊 Mensajes procesados
- ⏰ Última actividad

---

### `/status [código]` o `/substatus [código]`
Verifica el estado de un subbot específico.

**Uso:**
```
/status SUBBOT-001
```

---

### `/stopbot [código]` o `/substop [código]`
Detiene un subbot (owner).

**Uso:**
```
/stopbot SUBBOT-001
```

---

### `/update`
Actualiza el bot y recarga subbots (owner).

**Uso:**
```
/update
```

---

## 📡 APIs Utilizadas

### 🌐 Descargas de Redes Sociales

| Red Social | APIs Principales | Fallback |
|-----------|------------------|----------|
| TikTok | TikWM, Vreden | DownloaderBot |
| Instagram | Vreden | DownloaderBot |
| Facebook | Vreden | DownloaderBot |
| Twitter/X | Vreden | DownloaderBot |
| Pinterest | Vreden | PinterestDownloader |

### 🎵 Música y Videos

| Servicio | API Utilizada | Función |
|----------|---------------|---------|
| YouTube Search | Vreden YT Search | Búsqueda de videos |
| YouTube Download | ytdl (Vreden) | Descarga de audio/video |
| Spotify | Vreden Spotify API | Búsqueda y descarga |

### 🔧 Utilidades

| Utilidad | API Principal | Fallback |
|----------|---------------|----------|
| Traducción | LibreTranslate | MyMemory |
| Clima | Open-Meteo | WTTRin |
| Frases | Quotable | ZenQuotes |
| Datos curiosos | Useless Facts | API Ninjas |
| Trivia | Open Trivia DB | - |
| Memes | Meme API | ImgFlip |

### 🤖 Inteligencia Artificial

| Servicio | API | Configuración |
|----------|-----|---------------|
| IA General | Google Gemini AI | `GEMINI_API_KEY` en .env |

---

## 🔑 Variables de Entorno Requeridas

```env
# Bot Configuration
PORT=3000
NODE_ENV=production

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/dbname

# WhatsApp
BOT_NUMBER=1234567890

# AI Services
GEMINI_API_KEY=tu_clave_api_gemini

# Optional APIs
WEATHER_API_KEY=opcional
SPOTIFY_CLIENT_ID=opcional
SPOTIFY_CLIENT_SECRET=opcional
```

---

## 🚀 Características Destacadas

### ✅ Sistema de Fallback Automático
Si una API falla, el bot automáticamente intenta con la siguiente API disponible.

### ✅ Múltiples Proveedores
Para cada comando de descarga, hay 2-3 APIs configuradas como respaldo.

### ✅ Manejo de Errores Robusto
Mensajes de error claros y sugerencias de solución.

### ✅ Rate Limiting Inteligente
Evita sobrecarga de APIs con límites inteligentes.

### ✅ Logging Completo
Todos los comandos y errores se registran para debugging.

---

## 📞 Soporte

Si un comando no funciona:

1. Verifica la sintaxis del comando
2. Revisa los logs con `/logs`
3. Prueba el comando `/test` para verificar conectividad
4. Consulta este documento para el uso correcto
5. Contacta al administrador si el problema persiste

---

## 📝 Notas Importantes

- 🔒 Los comandos marcados con **(admin)** requieren permisos de administrador
- 👑 Los comandos marcados con **(owner)** solo pueden ser ejecutados por el propietario
- 📊 Todos los comandos son registrados en la base de datos
- ⚡ Las descargas pueden tardar dependiendo del tamaño del archivo
- 🌐 Se requiere conexión a internet estable para las APIs

---

## 🆕 Actualizaciones Recientes

### v2.5.0
- ✨ Sistema de fallback automático para todas las APIs
- 🔧 Comandos de configuración mejorados
- 🤖 Sistema de IA integrado con Gemini
- 📥 Soporte para múltiples redes sociales
- 🎵 Descargas de música mejoradas
- 🌐 Traducción multiidioma
- 📊 Sistema de estadísticas completo
- 🔐 Autenticación y registro de usuarios

---

**KONMI BOT v2.5.0** - Sistema de WhatsApp Bot Profesional
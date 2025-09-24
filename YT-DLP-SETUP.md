# 🎬 Configuración yt-dlp Multiplataforma

## 📋 Dependencias Recomendadas

### 🐧 **Linux (Ubuntu/Debian)**
```bash
# Instalar yt-dlp
sudo apt update
sudo apt install -y yt-dlp

# O instalar la versión más reciente
sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
sudo chmod a+rx /usr/local/bin/yt-dlp

# Dependencias adicionales
sudo apt install -y ffmpeg python3-pip

# Instalar dependencias Python opcionales
pip3 install --user yt-dlp[default]
```

### 🪟 **Windows**
```powershell
# Usando Chocolatey
choco install yt-dlp ffmpeg

# Usando Scoop
scoop install yt-dlp ffmpeg

# Usando pip
pip install yt-dlp[default]

# Descarga manual
# https://github.com/yt-dlp/yt-dlp/releases/latest
```

### 🍎 **macOS**
```bash
# Usando Homebrew
brew install yt-dlp ffmpeg

# Usando pip
pip3 install yt-dlp[default]
```

### 🐳 **Docker (Multiplataforma)**
```dockerfile
FROM python:3.11-slim

RUN apt-get update && apt-get install -y \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/*

RUN pip install yt-dlp[default]

COPY all_cookies.txt /app/cookies.txt
WORKDIR /app

CMD ["yt-dlp", "--help"]
```

## 🔧 Configuración Avanzada

### 📁 **Estructura de Archivos**
```
/home/admin/bot-whatsapp-panel-2.5-completo-v2/
├── all_cookies.txt          # Cookies Netscape
├── yt-dlp-config.yml        # Configuración personalizada
└── backend/full/
    └── commands-extended.js  # Comandos /play y /video
```

### ⚙️ **Archivo de Configuración (yt-dlp-config.yml)**
```yaml
# Configuración yt-dlp para el bot
output: '/tmp/%(title)s.%(ext)s'
cookies: '/home/admin/all_cookies.txt'
no_warnings: true
quiet: true
progress: true
newline: true

# Formatos preferidos
format: 'best[height<=720]/best'  # Para video
audio_format: 'mp3'               # Para audio
audio_quality: '0'                # Mejor calidad

# Configuraciones adicionales
no_playlist: true
extract_flat: false
write_info_json: false
write_thumbnail: false
```

### 🚀 **Script de Instalación Automática**
```bash
#!/bin/bash
# install-yt-dlp.sh

set -e

echo "🎬 Instalando yt-dlp y dependencias..."

# Detectar sistema operativo
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    # Linux
    if command -v apt &> /dev/null; then
        sudo apt update
        sudo apt install -y yt-dlp ffmpeg
    elif command -v yum &> /dev/null; then
        sudo yum install -y yt-dlp ffmpeg
    elif command -v pacman &> /dev/null; then
        sudo pacman -S yt-dlp ffmpeg
    fi
elif [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    if command -v brew &> /dev/null; then
        brew install yt-dlp ffmpeg
    else
        echo "❌ Homebrew no encontrado. Instala Homebrew primero."
        exit 1
    fi
elif [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "cygwin" ]]; then
    # Windows
    echo "🪟 Para Windows, instala manualmente desde:"
    echo "https://github.com/yt-dlp/yt-dlp/releases/latest"
    exit 0
fi

# Verificar instalación
if command -v yt-dlp &> /dev/null; then
    echo "✅ yt-dlp instalado correctamente"
    yt-dlp --version
else
    echo "❌ Error instalando yt-dlp"
    exit 1
fi

if command -v ffmpeg &> /dev/null; then
    echo "✅ ffmpeg instalado correctamente"
    ffmpeg -version | head -1
else
    echo "❌ Error instalando ffmpeg"
    exit 1
fi

echo "🎉 Instalación completada!"
```

## 🔍 **Verificación de Funcionamiento**

### 🧪 **Test de Comandos**
```bash
# Test básico
yt-dlp --version

# Test con cookies
yt-dlp --cookies /home/admin/all_cookies.txt --print "%(title)s" "https://www.youtube.com/watch?v=dQw4w9WgXcQ"

# Test de descarga (solo info)
yt-dlp --cookies /home/admin/all_cookies.txt --print "%(title)s|%(uploader)s|%(duration_string)s" "ytsearch1:bad bunny"
```

### 📊 **Monitoreo de Rendimiento**
```bash
# Verificar uso de memoria
ps aux | grep yt-dlp

# Verificar espacio en disco
df -h /tmp

# Logs del bot
tail -f /home/admin/bot-whatsapp-panel-2.5-completo-v2/logs/bot.log
```

## 🛠️ **Optimizaciones**

### ⚡ **Rendimiento**
- **Cache**: Usar `--cache-dir` para cachear metadatos
- **Concurrencia**: Limitar con `--concurrent-fragments`
- **Buffer**: Ajustar `--buffer-size` según RAM disponible

### 🔒 **Seguridad**
- **Cookies**: Mantener `all_cookies.txt` con permisos 600
- **Temporal**: Limpiar archivos en `/tmp` regularmente
- **Logs**: No logear URLs completas por privacidad

### 🌐 **Red**
- **Proxy**: Usar `--proxy` si es necesario
- **User-Agent**: Personalizar con `--user-agent`
- **Rate Limit**: Usar `--sleep-interval` para evitar bloqueos

## 📱 **Integración con WhatsApp Bot**

### 🎵 **Comando /play**
- Descarga audio en MP3
- Progreso en tiempo real
- Información completa del video
- Thumbnail como imagen separada

### 🎬 **Comando /video**
- Descarga video en MP4 (máx 720p)
- Progreso en tiempo real
- Información completa + resolución
- Thumbnail como imagen separada

### 📋 **Formato de Respuesta**
```
╔═══════════════════════════════════════╗
║           🎵 AUDIO DESCARGADO 🎵      ║
╚═══════════════════════════════════════╝

🎵 Título del Video
👤 Artista/Canal
⏱️ Duración: 3:45
👀 Vistas: 1,234,567
📅 Año: 2023
🔗 Enlace: https://youtube.com/...

⬇️ Enviando audio...
```

## 🚨 **Solución de Problemas**

### ❌ **Error: yt-dlp no encontrado**
```bash
# Verificar PATH
which yt-dlp

# Reinstalar
sudo apt install --reinstall yt-dlp
```

### ❌ **Error: Cookies inválidas**
```bash
# Verificar formato
head -5 /home/admin/all_cookies.txt

# Debe empezar con:
# # Netscape HTTP Cookie File
```

### ❌ **Error: Sin espacio en disco**
```bash
# Limpiar /tmp
sudo rm -rf /tmp/yt*

# Verificar espacio
df -h
```

### ❌ **Error: Video no disponible**
- Verificar que las cookies sean válidas
- Probar con otro video
- Verificar restricciones geográficas

## 📈 **Métricas y Monitoreo**

### 📊 **Estadísticas de Uso**
- Tiempo promedio de descarga
- Tasa de éxito por comando
- Uso de ancho de banda
- Errores más comunes

### 🔔 **Alertas**
- Espacio en disco bajo
- yt-dlp no responde
- Cookies expiradas
- Errores de red frecuentes

---

## 🎯 **Resumen de Beneficios**

✅ **Multiplataforma**: Funciona en Linux, Windows, macOS  
✅ **Sin restricciones**: Usa cookies para saltar bloqueos  
✅ **Progreso real**: Barra de progreso en tiempo real  
✅ **Información rica**: Título, artista, duración, vistas, etc.  
✅ **Optimizado**: Calidad apropiada para WhatsApp  
✅ **Robusto**: Manejo de errores y fallbacks  
✅ **Escalable**: Fácil de mantener y actualizar  

¡Tu bot ahora tiene capacidades de descarga de YouTube de nivel profesional! 🚀













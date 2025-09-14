#!/bin/bash

echo "🎵 Instalando dependencias para Melodia Bot..."

# Instalar dependencias del backend
echo "📦 Instalando dependencias del backend..."
cd backend/full
npm install

# Instalar dependencias adicionales para las nuevas funcionalidades
echo "🔧 Instalando dependencias adicionales..."
npm install yt-search ytdl-core axios qrcode pino chalk

# Instalar dependencias del template de sub-bot
echo "🤖 Instalando dependencias del template de sub-bot..."
cd ../../subbot-template
npm install

# Crear directorios necesarios
echo "📁 Creando directorios necesarios..."
cd ../backend/full
mkdir -p exports
mkdir -p jadibots
mkdir -p sessions
mkdir -p tmp

# Crear archivo de configuración de ejemplo
echo "⚙️ Creando archivo de configuración de ejemplo..."
cat > .env.example << EOF
# Configuración del Bot
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
OPENWEATHER_API_KEY=your_openweather_api_key_here
UNSPLASH_ACCESS_KEY=your_unsplash_access_key_here
GEMINI_API_KEY=your_gemini_api_key_here

# Servidor
PORT=3001
NODE_ENV=development
EOF

echo "✅ Instalación completada!"
echo ""
echo "📋 Próximos pasos:"
echo "1. Copia .env.example a .env y configura las variables"
echo "2. Configura tu base de datos PostgreSQL"
echo "3. Ejecuta las migraciones: npm run migrate"
echo "4. Inicia el bot: npm start"
echo ""
echo "🎵 ¡Melodia Bot está listo para usar!"

#!/bin/bash

# Script de configuración para Hetzner Cloud
# Este script configura un servidor Ubuntu/Debian para el proyecto WhatsApp Bot Panel

set -e

echo "🚀 Iniciando configuración para Hetzner..."

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Verificar si es root
if [[ $EUID -ne 0 ]]; then
   echo -e "${RED}Este script debe ejecutarse como root${NC}"
   exit 1
fi

# Actualizar sistema
echo -e "${YELLOW}Actualizando sistema...${NC}"
apt update && apt upgrade -y

# Instalar dependencias
echo -e "${YELLOW}Instalando dependencias...${NC}"
apt install -y \
    curl \
    wget \
    git \
    nginx \
    certbot \
    python3-certbot-nginx \
    ufw \
    fail2ban \
    htop \
    docker.io \
    docker-compose \
    nodejs \
    npm

# Iniciar y habilitar servicios
systemctl start docker
systemctl enable docker
systemctl start nginx
systemctl enable nginx

# Configurar firewall
echo -e "${YELLOW}Configurando firewall...${NC}"
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# Configurar fail2ban
echo -e "${YELLOW}Configurando seguridad...${NC}"
cat > /etc/fail2ban/jail.local << EOF
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 5

[sshd]
enabled = true
EOF

systemctl restart fail2ban
systemctl enable fail2ban

# Crear directorios necesarios
mkdir -p /opt/whatsapp-bot-panel
mkdir -p /opt/whatsapp-bot-panel/storage
mkdir -p /opt/whatsapp-bot-panel/logs
mkdir -p /opt/whatsapp-bot-panel/nginx/ssl

# Configurar permisos
chown -R www-data:www-data /opt/whatsapp-bot-panel/storage
chmod -R 755 /opt/whatsapp-bot-panel/storage

# Crear usuario para la aplicación
useradd -r -s /bin/false whatsapp-bot || true

# Configurar systemd service
cat > /etc/systemd/system/whatsapp-bot.service << EOF
[Unit]
Description=WhatsApp Bot Panel
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/whatsapp-bot-panel
ExecStart=/usr/bin/docker-compose -f docker-compose.hetzner.yml up -d
ExecStop=/usr/bin/docker-compose -f docker-compose.hetzner.yml down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable whatsapp-bot

# Instalar certificado SSL (requiere dominio)
echo -e "${GREEN}✅ Configuración básica completada!${NC}"
echo -e "${YELLOW}Para instalar el certificado SSL, ejecuta:${NC}"
echo "certbot --nginx -d tu-dominio.com"

# Mensaje final
echo -e "${GREEN}🎉 Configuración de Hetzner completada!${NC}"
echo ""
echo "Próximos pasos:"
echo "1. Copia tu proyecto a /opt/whatsapp-bot-panel/"
echo "2. Configura tu dominio apuntando al servidor"
echo "3. Ejecuta: certbot --nginx -d tu-dominio.com"
echo "4. Inicia el servicio: systemctl start whatsapp-bot"

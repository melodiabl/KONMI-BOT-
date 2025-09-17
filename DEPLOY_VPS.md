# Despliegue en VPS (sin Docker)

Pasos mínimos para levantar el panel y backend en un VPS con Caddy + Node.js + PostgreSQL.

## 1) Requisitos
- Node.js 18 o 20
- PostgreSQL 16 (o compatible) en localhost
- Caddy instalado (como servicio del sistema)

## 2) Base de datos
Crear base y usuario (ajusta credenciales si usas otras):

```sql
CREATE USER appuser WITH PASSWORD 'superpass';
CREATE DATABASE appdb OWNER appuser;
GRANT ALL PRIVILEGES ON DATABASE appdb TO appuser;
```

## 3) Variables de entorno del backend
Archivo `backend/full/.env` ya preparado para VPS:

```
DB_HOST=localhost
DB_PORT=5432
DB_USER=appuser
DB_PASSWORD=superpass
DB_NAME=appdb
NODE_ENV=production
PORT=3001
```

Puedes añadir `JWT_SECRET` personalizado y `OWNER_WHATSAPP_NUMBER` si aplica.

## 4) Instalar dependencias

En raíz (frontend y root opcionalmente) y backend:

```bash
# Backend (tiene su propio package.json)
cd backend/full
npm ci

# Frontend (opcional si ya existe dist)
cd ../../frontend-panel
npm ci
npm run build
```

Si prefieres que `npm install` desde la raíz instale frontend automáticamente, ejecuta en raíz:

```bash
cd /home/admin/bot-whatsapp-panel-2.5-completo-v2
npm ci
```

## 5) Migraciones y arranque backend

Desde la raíz del repo:

```bash
npm run start:production
```

Este comando ejecuta migraciones usando el `knexfile` del backend y luego inicia `backend/full/index.js` en `0.0.0.0:3001`.

## 6) Caddy

El archivo `frontend-panel/Caddyfile` ya está configurado para escuchar en `:80` y:
- Servir `frontend-panel/dist`
- Proxear `/api/*` y `/media/*` al backend `localhost:3001`

Aplica la config y recarga Caddy según tu instalación (por ejemplo en Debian/Ubuntu):

```bash
sudo cp frontend-panel/Caddyfile /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

Si tienes dominio, cambia el primer renglón por tu dominio (ej: `midominio.com`).

## 7) Servicio en segundo plano

Opcional: crea un servicio systemd para el backend. Archivo de ejemplo `/etc/systemd/system/konmi-backend.service`:

```
[Unit]
Description=Konmi WhatsApp Bot Backend
After=network.target

[Service]
Type=simple
User=admin
WorkingDirectory=/home/admin/bot-whatsapp-panel-2.5-completo-v2/backend/full
Environment=NODE_ENV=production
Environment=PORT=3001
ExecStart=/usr/bin/node /home/admin/bot-whatsapp-panel-2.5-completo-v2/backend/full/index.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Luego:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now konmi-backend
```

## 8) Verificación rápida
- Backend: `curl http://127.0.0.1:3001/api/health`
- Frontend: abrir en navegador `http://<IP-o-dominio>/`

## Notas
- Si prefieres Docker Compose, no cambies `DB_HOST` a `localhost` y usa `docker-compose.yml` (el servicio se conecta a `db`).
- Para sub-bots, `create-subbot.sh` requiere Docker en el host.


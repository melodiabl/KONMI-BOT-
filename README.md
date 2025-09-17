# KONMI-BOT-
KONMI BOT , CREADA CON IA Y EN DESARROLLO

## Despliegue rápido (frontend fuera de Docker)

- Frontend no se construye con Docker. Primero compila el panel con npm y luego levanta los servicios con Docker (solo backend, DB, etc.).

Pasos:
- `./start-system.sh` — compila `frontend-panel` con `npm run build` y levanta Docker Compose.
- Caddy en el host sirve `frontend-panel/dist` y proxya `/api` al backend.

Detalles y alternativas en `DEPLOY_VPS.md`.

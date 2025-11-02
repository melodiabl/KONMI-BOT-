KONMI-BOT — Estructura Unificada

Backend modular (full) con comandos organizados en `backend/full/commands/` y enrutamiento central.

Arranque
- Producción: `npm start`
- Solo backend full: `npm run start:full`

Comandos (WhatsApp)
- Subbots: `/qr`, `/code`, `/mybots`, `/bots`
- Bot control: `/bot on|off` (grupo), `/bot global on|off` (owner)
- Media: `/play <texto>`, `/video <texto>`, `/tiktok <url>`, `/download <url>`
- Archivos: `/guardar`, `/archivos`, `/misarchivos`, `/buscararchivo <texto>`
- Utilidades: `/short <url>`, `/tts <texto>`, `/image <prompt>`, `/brat <texto>`, `/bratvd <texto>`
- Votaciones: `/crearvotacion`, `/votar`, `/cerrarvotacion`
- Admin/Owner: `/owner`, `/checkowner`, `/setowner <numero> <nombre>`, `/debugme`, `/debugfull`, `/testadmin`
- Info: `/ping`, `/status`, `/test`, `/whoami`

Dónde está cada cosa
- Router: `backend/full/handler.js`
- Registro de comandos: `backend/full/commands/registry/index.js`
- Subbots/control: `backend/full/commands/pairing.js`, `backend/full/commands/bot-control.js`
- Admin/Owner: `backend/full/commands/admin.js`
- Media/archivos/utilidades: `backend/full/commands/*.js`, `backend/full/file-manager.js`, `backend/full/utils/`

Notas
- `backend/full/README.md` contiene un resumen del backend y comandos.

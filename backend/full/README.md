KONMI-BOT — Backend (Full)

Estructura limpia con comandos modulares en `backend/full/commands/`.

Arranque rápido
- Producción: `npm start`
- Solo backend full: `npm run start:full`

Comandos principales (WhatsApp)
- Subbots: `/qr`, `/code`, `/mybots`, `/bots`
- Bot control: `/bot on|off` (en grupo), `/bot global on|off` (owner)
- Media: `/play <texto>`, `/video <texto>`, `/tiktok <url>`, `/download <url>`
- Archivos: `/guardar` (responder a media), `/archivos`, `/misarchivos`, `/buscararchivo <texto>`
- Utilidades: `/short <url>`, `/tts <texto>`, `/image <prompt>`, `/brat <texto>`, `/bratvd <texto>`
- Votaciones: `/crearvotacion`, `/votar <opción>`, `/cerrarvotacion <id>`
- Admin/Owner: `/owner`, `/checkowner`, `/setowner <numero> <nombre>`, `/debugme`, `/debugfull`, `/testadmin`
- Info: `/ping`, `/status`, `/test`, `/whoami`

Dónde vive cada cosa
- Router: `backend/full/handler.js` (delegado al registro)
- Registro: `backend/full/commands/registry/index.js`
- Subbots: `commands/pairing.js`, `commands/bot-control.js`, `lib/subbots.js`
- Media: `commands/download-commands.js`, utilidades en `utils/`
- Archivos: `commands/*` + `file-manager.js`
- Admin/Owner: `commands/admin.js`, `global-config.js`

Dependencias por comando
- `fetch` seguro: `utils/fetch.js` (auto-carga `node-fetch` si falta)
- Envío de resultados enriquecidos: `handler.js` soporta `type: image | video | audio | sticker`
- DB/knex: `db.js`, migraciones en `migrations/`

Notas
- `/update` detiene subbots (best-effort), hace git pull/npm ci si aplica y reinicia el proceso.
- Mantén `OWNER_WHATSAPP_NUMBER` en `.env` para owner.

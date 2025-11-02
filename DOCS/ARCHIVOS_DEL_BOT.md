# Archivos que conforman el bot (solo esenciales)

Este documento enumera y describe únicamente los archivos de código que componen el bot (backend Full). Se excluyen backups, tests, herramientas, scripts de soporte, artefactos de ejecución y almacenamiento.

## Alcance y exclusiones

- Incluido: `backend/full` (código del bot), configuraciones y migraciones de base de datos.
- Excluido: `backend/full/storage/`, `backend/full/tools/`, `backend/full/scripts/`, archivos `*.bak`, `*backup*`, `test-*`, `*.test.*`, logs, `Dockerfile`, `package-lock.json`, documentación auxiliar.

---

## Núcleo de la aplicación

- `backend/full/index.js` — Arranque del servidor Express, rutas base (`/api`, `/api/auth`, salud), exposición de QR/estado y conexión inicial a WhatsApp. Ejecuta migraciones al inicio y sincroniza subbots.
- `backend/full/api.js` — Router principal de API para panel/dashboard: estado del bot, gestión de subbots, flujos en tiempo real (SSE), subida de archivos y utilidades.
- `backend/full/auth.js` — Autenticación JWT, middlewares `authenticateToken` y `authorizeRoles`, endpoints `/login`, `/register`, `/auto-register`, `/reset-password`.
- `backend/full/config.js` — Configuración unificada (servidor, JWT, CORS, datos del bot, frontend), carga `.env`.
- `backend/full/db.js` — Cliente Knex y helpers (`all`, `get`, `prepare`, `run`) compatibles con distintos drivers.
- `backend/full/knexfile.js` — Configuración de Knex por entorno para migraciones.
- `backend/full/global-config.js` — Parámetros globales del bot (fallbacks/constantes compartidas).
- `backend/full/config/logger.js` — Logger Pino y helpers de logging del sistema.
- `backend/full/package.json` — Dependencias y scripts del backend Full.

## Contratos de módulos (exportaciones clave)

- `backend/full/whatsapp.js`
  - Exporta: `connectToWhatsApp(authPath)`, `getQRCode()`, `getQRCodeImage()`, `getCurrentPairingCode()`, `getCurrentPairingInfo()`, `getPairingTargetNumber()`, `connectWithPairingCode(phone, authPath)`, `getConnectionStatus()`, `getBotStatus()`, `getSocket()`, `getAvailableGroups()`, `setAuthMethod(method)`, `clearWhatsAppSession()`.
- `backend/full/handler.js`
  - Exporta (selección): `addAporte({ contenido, tipo, usuario, grupo, fecha, mediaPath })`, `addPedido({ usuario, grupo, contenido, fecha })`, `handleAportar(...)`, `handlePedido(...)`, `handlePedidos(usuario, grupo)`, `getProviderStats()`, `getProviderAportes()`, `chatWithAI(msg, ctx)`, `analyzeContentWithAI(text, filename)`, `analyzeManhwaContent(text)`, `handleIA(...)`, `handleMyAportes(...)`, `handleAportes(...)`, `handleAddAporte(...)`, `handleAporteEstado(...)`, `handleLock(...)`, `handleUnlock(...)`, `handleTag(...)`, `handleWhoami(...)`, `handleDebugAdmin(...)`.
- `backend/full/commands/*` — Comandos modulares organizados por dominio (ai, system, groups, files, images, maintenance, pairing, etc.).
  - Registro central: `backend/full/commands/registry/index.js`.
  - Router de despacho: `backend/full/commands/router.js`.
- `backend/full/subbot-manager.js`
  - Exporta: `createSubbotWithPairing({ ownerNumber, targetNumber, ... })`, `createSubbotWithQr({ ownerNumber, ... })`, `listUserSubbots(owner)`, `deleteUserSubbot(code, owner)`, `getSubbotByCode(code)`, `attachRuntimeListeners(code, listeners)`, `updateSubbotMetadata(code, patch)`, `markSubbotConnected(code, data)`, `markSubbotDisconnected(code, reason)`, `getActiveRuntimeSubbots()`, `syncAllRuntimeStates()`, `cleanOrphanSubbots()`, `isBotGloballyActive()`, `isBotActiveInGroup(jid)`, `setSubbotGroupState(...)`, `getSubbotGroupState(...)`.
- `backend/full/lib/subbots.js`
  - Exporta fachada: `generateSubbotPairingCode(...)`, `generateSubbotQR(...)`, `getSubbotStatus(code)`, `getAllSubbots(owner)`, `startSubbot(...)`, `stopSubbotRuntime(code)`, `removeSubbot(code, owner)`, `listRuntimeSubbots()`, `attachSubbotListeners(...)`, `detachSubbotListeners(...)`, `syncSubbotsRuntime()`, `cleanupSubbots()`.
- `backend/full/realtime.js`
  - Exporta SSE: `handleBotCommandsStream`, `handleUsuariosStream`, `handleGruposStream`, `handlePedidosStream`, `handleNotificacionesStream`, `handleAportesStream` y emisores `emit*Event`.
- `backend/full/gemini-ai-handler.js`
  - Exporta: `analyzeContentWithAI(text, filename)`, `chatWithAI(message, context)`, `analyzeManhwaContent(text)`.
- `backend/full/utils/api-providers.js`
  - Exporta: `downloadTikTok`, `downloadInstagram`, `downloadFacebook`, `downloadTwitter`, `downloadPinterest`, `searchYouTubeMusic`, `downloadYouTube`, `searchSpotify`, `translateText`, `getWeather`, `getRandomQuote`, `getRandomFact`, `getTrivia`, `getRandomMeme`, `downloadWithFallback`.

## WhatsApp y flujo de comandos

- `backend/full/whatsapp.js` — Integración con Baileys (carga dinámica), manejo de QR/Pairing, conexión y reconexión, despacho de comandos y actualización de estado global.
- `backend/full/handler.js` — Lógica principal: alta de aportes/pedidos, clasificación/IA, manejo de media, gestión de grupos/usuarios y utilidades para el flujo del bot.
- `backend/full/commands/*` — Comandos modulares por dominio y registro central (`commands/registry`).
- `backend/full/commands/download-commands.js` — Comandos de descarga (TikTok, Instagram, Facebook, Twitter, YouTube, Pinterest, Spotify, clima, memes, etc.) mediante proveedores externos.
- `backend/full/commands/subbot-commands.js` — Comandos para el sistema de SubBots: crear (QR/Pairing), listar, eliminar, configurar, reiniciar y ayuda.
- `backend/full/fix-message-handler.js` — Ajustes utilitarios para manejo de mensajes (compatibilidad/estabilidad del flujo).

## Endpoints principales de API (panel)

- Bot/WhatsApp
  - `GET /api/whatsapp/qr`, `GET /api/bot/qr` — Obtener QR/código de emparejamiento y estado.
  - `GET /api/whatsapp/status` — Estado de conexión.
  - `POST /api/whatsapp/logout` — Cerrar sesión.
  - `POST /api/bot/restart`, `POST /api/bot/disconnect` — Reinicio/control.
  - `GET /api/whatsapp/groups` — Grupos disponibles.
- Auth
  - `POST /api/auth/login`, `POST /api/auth/register` (roles), `POST /api/auth/auto-register`, `POST /api/auth/reset-password`.
- Subbots
  - `GET /api/subbots`, `POST /api/subbots/qr`, `POST /api/subbots/code`, `DELETE /api/subbots/:id`.
- IA
  - `GET /api/ai/stats`, `POST /api/ai/chat`, `POST /api/ai/ask`.
- Aportes y proveedores
  - `GET /api/aportes`, `POST /api/aportes`, `GET /api/aportes/:id`, `DELETE /api/aportes/:id`, `GET /api/aportes/stats`.
  - `GET /api/proveedores`, `POST /api/proveedores`, `DELETE /api/proveedores/:jid`, `GET /api/proveedores/stats`.
- Otros
  - `GET /api/bot/status`, `GET /api/bot/global-state`, `POST /api/bot/global-state`.
  - `GET /api/grupos`, `GET /api/grupos/available`, `GET /api/grupos/stats`.
  - `GET /api/pedidos`, `POST /api/pedidos`, `GET /api/pedidos/:id`, `GET /api/pedidos/stats`.
  - `GET /api/logs`, `GET /api/logs/stats`, `GET /api/logs/categoria/:categoria`, `POST /api/logs`, `DELETE /api/logs`, `GET /api/logs/export`.
  - Streams SSE: `GET /api/streams/*` según `realtime.js` (usuarios, grupos, pedidos, aportes, etc.).

## SubBots (multi‑instancia)

- `backend/full/subbot-manager.js` — Gestión de subbots: creación (QR/Pairing), persistencia/estado, sincronización runtime y utilidades administrativas.
- `backend/full/subbot-api.js` — Endpoints y lógica de API relacionados con subbots.
- `backend/full/subbot-init.js` — Inicialización de subbots y preparación de recursos.
- `backend/full/subbot-runner.js` — Ejecutor/ciclo de vida de subbots en runtime.
- `backend/full/subbot-service.js` — Servicio de supervisión y tareas periódicas: limpieza inteligente, control de memoria, límites, etc.
- `backend/full/inproc-subbots.js` — Control de subbots en proceso: lanzamiento, parada, listeners y runtime activo.
- `backend/full/lib/subbots.js` — Fachada de funciones de subbots para el resto del sistema (generar QR/Pairing, consultas de estado, listeners, limpieza, sincronización).

## IA (Inteligencia Artificial)

- `backend/full/gemini-ai-handler.js` — Llamadas HTTP directas a Gemini (análisis de contenido, chat y análisis de manhwas), parseo de respuestas y contrato estándar `{ success, response/analysis, model }`.
- `backend/full/gemini-client.js` — Cliente `@google/generative-ai`, resolución de API key y obtención de modelos (`gemini-1.5-flash`).

## Gestión de archivos y media

- `backend/full/file-manager.js` — Descarga de archivos por URL, procesamiento de media de WhatsApp con Baileys, almacenamiento en `storage/media` y registro en DB.
- `backend/full/utils/message-logger.js` — Registro de mensajes y eventos para auditoría/depuración.
- `backend/full/utils/progress-notifier.js` — Utilidades para notificar progreso en acciones largas.
- `backend/full/utils/fetch.js` — Wrapper de `fetch/axios` centralizado para peticiones HTTP.
- `backend/full/utils/api-providers.js` — Proveedores externos para descargas/servicios (TikTok, Instagram, Twitter, YouTube, Spotify, clima, memes, etc.).

## Tiempo real (panel)

- `backend/full/realtime.js` — Flujos y emisores en tiempo real (SSE/eventos) para usuarios, grupos, pedidos, aportes y notificaciones del panel.

## Base de datos

- `backend/full/migrations/*.cjs|*.js` — Migraciones de esquema: tablas de aportes, pedidos, votaciones, notificaciones, logs, contactos de WA, subbots, eventos, estado global, descargas, etc.
- `backend/full/schemas/*.sql` — Esquemas SQL de referencia para subbots y aportes.
- `backend/full/init-db.js` — Inicialización/seed de base de datos (utilidad de arranque/controlado por scripts).
- `backend/full/fix-database.js` — Utilidades de reparación/ajuste del esquema o datos (mantenimiento controlado).

### Tablas clave (resumen mínimo)

- `usuarios`: `id`, `username`, `password`, `rol`, `whatsapp_number`, `grupo_registro`, fechas.
- `aportes`: `id`, `contenido`, `tipo`, `estado`, `usuario`, `grupo`, `fecha`, campos opcionales de clasificación (`manhwa_titulo`, `contenido_tipo`, `proveedor`, etc.).
- `pedidos`: `id`, `contenido`, `estado`, `usuario`, `grupo`, `fecha`.
- `logs`: `id`, `tipo`, `comando`, `usuario`, `grupo`, `fecha`, `detalles` (JSON).
- `subbots`: `id`, `code`, `user_phone`, `user_name`, `status`, `connection_type`, `qr_code`, `pairing_code`, `session_data`, `created_at`, `last_activity`, `connected_at`, `is_active`, `is_online`, `message_count`, `settings`.
- `subbot_events`: `id`, `code`, `event`, `payload`, `created_at`.
- `bot_global_state`: `id`, `is_on`, timestamps.
- Otras (según migraciones): `votaciones`, `votos`, `notificaciones`, `grupos_autorizados`, `wa_contacts`, `descargas`, `manhwas`.

## Configuración y entorno

- `backend/full/.env.example` — Variables de entorno esperadas (DB, JWT, CORS, claves de IA, etc.).
- `backend/full/nodemon.json` — Configuración de recarga en desarrollo (dev‑only; no requerido en producción).

### Variables de entorno relevantes

- Servidor/JWT: `PORT`, `SERVER_PORT`, `HOST`, `NODE_ENV`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `BCRYPT_ROUNDS`.
- Frontend/CORS: `FRONTEND_URL`, `RAILWAY_STATIC_URL`.
- Dueño: `OWNER_WHATSAPP_NUMBER`.
- Base de datos (Knex): `DATABASE_URL` o `DB_CLIENT` (`pg|sqlite3`), `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DATABASE_PATH`.
- WhatsApp/Baileys: `BAILEYS_MODULE` (opcional para forks).
- IA (Gemini): `GEMINI_API_KEY` (también reconoce `GOOGLE_API_KEY`, `GENAI_API_KEY`).
- Subbots/servicios: `MAX_SUBBOTS`, `SUBBOT_TIMEOUT`, `CLEANUP_INTERVAL`, `MAX_MEMORY_MB`.

## Secuencia de arranque mínima

- `index.js`
  - Ejecuta migraciones (`db.migrate.latest()`).
  - Inicia Express y registra routers (`/api`, `/api/auth`).
  - Conecta WhatsApp: `connectToWhatsApp(storagePath)` y sincroniza subbots `syncAllRuntimeStates()`.
  - Expone endpoints de QR/estado y health check.

## Dependencias clave (runtime)

- Servidor/seguridad: `express`, `cors`, `body-parser`, `jsonwebtoken`, `bcryptjs`, `pino`.
- WhatsApp: `@whiskeysockets/baileys` (o forks compatibles).
- BD: `knex`, `pg` (o `sqlite3`).
- Utilidades: `axios`, `multer`, `qrcode`.
- IA: `@google/generative-ai` (Gemini) y `axios` para HTTP.

---

## Quedan explícitamente fuera de este listado

- Artefactos de ejecución y sesiones: `backend/full/storage/**`.
- Scripts y herramientas operativas: `backend/full/scripts/**`, `backend/full/tools/**`.
- Pruebas y ejemplos: `backend/full/test-*`, `*.test.*`.
- Backups/temporales: archivos que terminen en `*.bak` o contengan `backup`.
- Archivos no esenciales de build/infra: `Dockerfile`, `package-lock.json`, logs.

Si necesitas el mismo listado en formato “solo rutas” para auditoría o un resumen más corto por módulos, dímelo y lo genero a partir de este inventario.

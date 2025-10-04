import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import { connectToWhatsApp, getAvailableGroups, getQRCode, getQRCodeImage, getConnectionStatus, getSocket } from './whatsapp.js';
import apiRouter from './api.js';
import { router as authRouter, authenticateToken, authorizeRoles } from './auth.js';
import subbotRouter from './subbot-api.js';
import { getAuthDefaults } from './global-config.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import db from './db.js';
import config from './config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const port = config.server.port;

app.use(cors(config.cors));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Serve storage media statically (uploads, media, downloads)
app.use('/media', express.static(join(__dirname, 'storage')));

// Serve static files from frontend build in production
// Comentado: El frontend se sirve con Caddy
// if (process.env.NODE_ENV === 'production') {
//   const frontendDistPath = join(__dirname, '../../frontend-panel/dist');
//   app.use(express.static(frontendDistPath));
// }

// La autenticacin interactiva ahora est integrada en whatsapp.js
// No es necesario preguntar aqu, se preguntar automticamente al conectar

// Rutas de autenticacin
app.use('/api/auth', authRouter);

// Rutas de subbots (panel e in-proc manager)
app.use('/api/subbot', subbotRouter);

// Rutas principales de la API
app.use('/api', apiRouter);


// Endpoints de WhatsApp bajo /api
app.get('/api/whatsapp/qr', authenticateToken, authorizeRoles('owner'), (_req, res) => {
  const qrImage = getQRCodeImage();
  const status = getConnectionStatus();

  if (qrImage) {
    const base64Data = qrImage.replace(/^data:image\/png;base64,/, '');
    return res.json({
      qr: base64Data,
      qrImage,
      status: 'waiting_for_scan'
    });
  }

  res.json({ qr: null, qrImage: null, status });
});

app.get('/api/bot/qr', authenticateToken, authorizeRoles('owner'), (_req, res) => {
  const qrImage = getQRCodeImage();
  const qrCode = getQRCode();
  const status = getConnectionStatus();

  if (qrImage) {
    const base64Data = qrImage.replace(/^data:image\/png;base64,/, '');
    return res.json({
      available: true,
      qr: base64Data,
      qrCode,
      qrCodeImage: qrImage,
      status: 'waiting_for_scan'
    });
  }

  if (qrCode) {
    return res.json({
      available: true,
      qr: qrCode,
      qrCode,
      qrCodeImage: null,
      status: 'waiting_for_scan'
    });
  }

  res.json({
    available: false,
    qr: null,
    qrCode: null,
    qrCodeImage: null,
    status: status.status,
    message: 'No hay cdigo QR disponible'
  });
});

app.get('/api/whatsapp/status', authenticateToken, authorizeRoles('admin', 'owner'), (_req, res) => {
  const status = getConnectionStatus();
  res.json({ status });
});

app.post('/api/whatsapp/logout', authenticateToken, authorizeRoles('owner'), async (_req, res) => {
  try {
    const sock = getSocket();
    if (sock) {
      await sock.logout();
      return res.json({ success: true, message: 'Desconectado exitosamente' });
    }
    return res.json({ success: false, message: 'No hay conexin activa' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Compatibilidad con versiones anteriores del panel
app.post('/api/bot/disconnect', authenticateToken, authorizeRoles('owner'), async (_req, res) => {
  try {
    const sock = getSocket();
    if (sock) {
      await sock.logout();
      return res.json({ success: true });
    }
    return res.json({ success: false, message: 'No hay conexin activa' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/bot/restart', authenticateToken, authorizeRoles('owner'), async (_req, res) => {
  try {
    const sock = getSocket();
    if (sock) {
      try { await sock.logout(); } catch (_) {}
    }
    await connectToWhatsApp(join(__dirname, 'storage', 'baileys_full'));
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// Endpoint para obtener grupos disponibles del bot
app.get('/api/whatsapp/groups', authenticateToken, authorizeRoles('admin', 'owner'), async (req, res) => {
  try {
    const groups = await getAvailableGroups();
    res.json(groups);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Health check endpoint for Railway
app.get('/api/health', (req, res) => {
  res.status(200).json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Catch-all handler: send back React's index.html file in production
// Comentado: El frontend se sirve con Caddy
// if (process.env.NODE_ENV === 'production') {
//   app.get('*', (req, res) => {
//     const frontendDistPath = join(__dirname, '../../frontend-panel/dist');
//     res.sendFile(join(frontendDistPath, 'index.html'));
//   });
// }

// Start the bot connection and server
async function start() {
  // 0) Migraciones automáticas (idempotentes)
  try {
    console.log(' Ejecutando migraciones de base de datos...');
    await db.migrate.latest();
    console.log(' Migraciones aplicadas correctamente.');
  } catch (error) {
    console.warn(' No se pudieron aplicar migraciones automáticamente:', error?.message || error);
  }

  // 1) Iniciar el servidor HTTP
  app.listen(port, config.server.host, () => {
    console.log(` Backend server listening on port ${port}`);
    console.log(` Environment: ${config.server.environment}`);
    console.log(` Frontend URL: ${config.frontend.url}`);
    console.log(` Bot: ${config.bot.name} v${config.bot.version}`);
    console.log(''); // Línea en blanco antes del menú de autenticación
  });

  // 2) Conectar el bot (esto mostrará el menú interactivo según método seleccionado)
  await connectToWhatsApp(join(__dirname, 'storage', 'baileys_full'));

  // 3) Inicializar subbots (solo si la conexión fue exitosa)
  try {
    const { initializeSubbots } = await import('./subbot-init.js');
    await initializeSubbots();
    console.log('✅ Subbots inicializados correctamente');
  } catch (error) {
    console.error('❌ Error al inicializar subbots:', error);
  }
}

start();

export { db, app };

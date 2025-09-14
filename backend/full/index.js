import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import { connectToWhatsApp, getAvailableGroups } from './whatsapp.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import db from './db.js';
import config from './config.js';
import subbotApi from './subbot-api.js';

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

// Example API endpoint: get dashboard stats
app.get('/api/dashboard/stats', async (req, res) => {
  try {
    const usuariosCount = await db('usuarios').count('id as count').first();
    const aportesCount = await db('aportes').count('id as count').first();
    const pedidosCount = await db('pedidos').count('id as count').first();
    // Contar grupos con entry o estimar a partir de registros; si no hay tabla, devolver 0
    let gruposCount = { count: 0 };
    try {
      gruposCount = await db('grupos_autorizados').count('id as count').first();
    } catch (_) {
      gruposCount = { count: 0 };
    }

    res.json({
      usuarios: usuariosCount.count,
      aportes: aportesCount.count,
      pedidos: pedidosCount.count,
      grupos: gruposCount.count,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Endpoint para recibir notificaciones de sub-bots
app.post('/api/subbot/event', async (req, res) => {
  try {
    const { subbotId, event, data, timestamp } = req.body;
    
    console.log(`📱 Sub-bot ${subbotId} - Evento: ${event}`);
    
    // Guardar pairing code si es el evento correspondiente
    if (event === 'pairing_code' && data.code) {
      await db('subbots').where('code', subbotId).update({
        pairing_code: data.code,
        status: 'waiting_pairing',
        last_heartbeat: new Date().toISOString()
      });
      return res.json({ success: true });
    }

    // Actualizar estado del sub-bot en la base de datos
    await db('subbots').where('code', subbotId).update({
      status: event === 'connected' ? 'connected' : 
              event === 'disconnected' ? 'disconnected' : 
              event === 'qr_ready' ? 'qr_ready' : 'pending',
      last_heartbeat: new Date().toISOString(),
      qr_data: event === 'qr_ready' ? data.qrData : null
    });

    // Si es un evento de QR listo, guardar la ruta del QR
    if (event === 'qr_ready' && data.qrPath) {
      await db('subbots').where('code', subbotId).update({
        qr_path: data.qrPath
      });
    }

    // Si el sub-bot se conecta, limpiar el pairing code
    if (event === 'connected') {
      await db('subbots').where('code', subbotId).update({
        pairing_code: null
      });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error processing subbot event:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Endpoint para consultar pairing code y estado de sub-bot
app.get('/api/subbot/:id/pairing-code', async (req, res) => {
  try {
    const { id } = req.params;
    const subbot = await db('subbots').where('code', id).first();
    if (!subbot) {
      return res.status(404).json({ error: 'Sub-bot no encontrado' });
    }
    res.json({
      pairing_code: subbot.pairing_code,
      status: subbot.status,
      connected: subbot.status === 'connected',
      last_heartbeat: subbot.last_heartbeat
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get bot connection status
app.get('/api/bot/status', async (req, res) => {
  try {
    const status = getConnectionStatus();
    const sock = getSocket();
    
    // Obtener información adicional del socket si está disponible
    let phone = null;
    if (sock && sock.user) {
      phone = sock.user.id.split('@')[0];
    }
    
    res.json({
      ...status,
      connected: status.isConnected,
      phone: phone,
      lastSeen: status.timestamp
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

import apiRouter from './api.js';
import { router as authRouter } from './auth.js';
import { getQRCode, getQRCodeImage, getConnectionStatus, getSocket } from './whatsapp.js';

// Rutas de autenticación
app.use('/api/auth', authRouter);

// Rutas de subbots
app.use('/api/subbot', subbotApi);

// Rutas de API
app.use('/api', apiRouter);

// Endpoints de WhatsApp bajo /api
app.get('/api/whatsapp/qr', (req, res) => {
  const qrImage = getQRCodeImage();
  const status = getConnectionStatus();
  
  if (qrImage) {
    // Extraer solo la parte base64 de la imagen
    const base64Data = qrImage.replace(/^data:image\/png;base64,/, '');
    res.json({ 
      qr: base64Data, 
      qrImage: qrImage,
      status: 'waiting_for_scan' 
    });
  } else {
    res.json({ qr: null, qrImage: null, status });
  }
});

// Endpoint de QR para el bot (compatibilidad con frontend)
app.get('/api/bot/qr', (req, res) => {
  const qrImage = getQRCodeImage();
  const qrCode = getQRCode();
  const status = getConnectionStatus();
  
  if (qrImage) {
    // Extraer solo la parte base64 de la imagen
    const base64Data = qrImage.replace(/^data:image\/png;base64,/, '');
    res.json({ 
      available: true,
      qr: base64Data, 
      qrCode: qrCode,
      qrCodeImage: qrImage,
      status: 'waiting_for_scan' 
    });
  } else if (qrCode) {
    res.json({ 
      available: true,
      qr: qrCode, 
      qrCode: qrCode,
      qrCodeImage: null,
      status: 'waiting_for_scan' 
    });
  } else {
    res.json({ 
      available: false,
      qr: null, 
      qrCode: null,
      qrCodeImage: null,
      status: status.status,
      message: 'No hay código QR disponible' 
    });
  }
});

app.get('/api/whatsapp/status', (req, res) => {
  const status = getConnectionStatus();
  res.json({ status });
});

app.post('/api/whatsapp/logout', async (req, res) => {
  try {
    const sock = getSocket();
    if (sock) {
      await sock.logout();
      res.json({ success: true, message: 'Desconectado exitosamente' });
    } else {
      res.json({ success: false, message: 'No hay conexión activa' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Endpoint para obtener grupos disponibles del bot
app.get('/api/whatsapp/groups', async (req, res) => {
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
  await connectToWhatsApp(join(__dirname, 'storage', 'baileys_full'));
  app.listen(port, config.server.host, () => {
    console.log(`🚀 Backend server listening on port ${port}`);
    console.log(`🌍 Environment: ${config.server.environment}`);
    console.log(`🔗 Frontend URL: ${config.frontend.url}`);
    console.log(`🤖 Bot: ${config.bot.name} v${config.bot.version}`);
  });
}

start();

export { db, app };

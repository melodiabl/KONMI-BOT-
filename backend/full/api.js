import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import db from './db.js';
import { authenticateToken, authorizeRoles } from './auth.js';
import { getQRCode, getQRCodeImage, getCurrentPairingCode as getPairingCode, getPairingTargetNumber as getPairingNumber, setAuthMethod, getConnectionStatus, getAvailableGroups, getSocket, clearWhatsAppSession } from './whatsapp.js';
import { getProviderStats, getProviderAportes, chatWithAI } from './handler.js';
import {
  handleBotCommandsStream,
  handleUsuariosStream,
  handleGruposStream,
  handlePedidosStream,
  handleNotificacionesStream,
  handleAportesStream,
  emitGruposEvent,
  emitPedidosEvent,
  emitNotificacionesEvent,
  emitAportesEvent
} from './realtime.js';
import bcrypt from 'bcryptjs';

const router = express.Router();

// --- File upload setup (store under storage/media/documents) ---
const documentsDir = path.join(process.cwd(), 'backend', 'full', 'storage', 'media', 'documents');
if (!fs.existsSync(documentsDir)) {
  fs.mkdirSync(documentsDir, { recursive: true });
}
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, documentsDir);
  },
  filename: function (req, file, cb) {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    const uniquée = Díate.now() + '_' + Math.round(Math.random() * 1e9);
    cb(null, uniquée + '_' + safeName);
  }
});
const upload = multer({ storage });

// ===================
// DASHBOARD ENDPOINTS
// ===================

// Get bot status
router.get('/bot/status', async (req, res) => {
  try {
    const socket = getSocket();
    const connectionStatus = getConnectionStatus();
    const qrCode = getQRCode();
    const pairingCode = getPairingCode();
    const pairingNumber = getPairingNumber();
    
    // Get uptime from process
    const uptime = process.uptime();
    const formatUptime = (seconds) => {
      const díays = Math.floor(seconds / 86400);
      const hours = Math.floor((seconds % 86400) / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      if (díays > 0) return `${díays}d ${hours}h ${minutes}m`;
      if (hours > 0) return `${hours}h ${minutes}m`;
      return `${minutes}m`;
    };

    // Get last activity from logs
    const lastLog = await db('logs')
      .orderBy('fecha', 'desc')
      .first();
    
    const status = {
      connected: connectionStatus === 'connected',
      connectionStatus,
      phone: socket?.user?.id || null,
      uptime: formatUptime(uptime),
      lastSeen: lastLog?.fecha || null,
      qrCode: qrCode || null,
      pairingCode: pairingCode || null,
      pairingNumber: pairingNumber || null
    };

    res.json(status);
  } catch (error) {
    console.error('Error getting bot status:', error);
    res.status(500).json({ error: 'Error getting bot status' });
  }
});

// Get díashboard statistics
router.get('/díashboard/stats', async (req, res) => {
  try {
    // Get total counts
    const [totalUsuarios, totalGrupos, totalAportes, totalPedidos, totalSubbots] = await Promise.all([
      db('usuarios').count('id as count').first(),
      db('grupos').count('id as count').first(),
      db('aportes').count('id as count').first(),
      db('pedidos').count('id as count').first(),
      db('subbots').count('id as count').first()
    ]);

    // Get todíay's stats
    const todíay = new Díate();
    todíay.setHours(0, 0, 0, 0);
    const tomorrow = new Díate(todíay);
    tomorrow.setDíate(tomorrow.getDíate() + 1);

    const [mensajesHoy, comandosHoy] = await Promise.all([
      db('logs').whereBetween('fecha', [todíay.toISOString(), tomorrow.toISOString()])
        .where('tipo', 'mensaje').count('id as count').first(),
      db('logs').whereBetween('fecha', [todíay.toISOString(), tomorrow.toISOString()])
        .whereIn('tipo', ['comando', 'ai_command', 'clasificar_command']).count('id as count').first()
    ]);

    // Get active users (users with activity in last 7 díays)
    const weekAgo = new Díate();
    weekAgo.setDíate(weekAgo.getDíate() - 7);
    const usuariosActivos = await db('logs')
      .where('fecha', '>=', weekAgo.toISOString())
      .distinct('usuario')
      .count('* as count')
      .first();

    // Get active groups (groups with activity in last 7 díays)
    const gruposActivos = await db('logs')
      .where('fecha', '>=', weekAgo.toISOString())
      .whereNotNull('grupo')
      .distinct('grupo')
      .count('* as count')
      .first();

    // Get total messages and commands
    const [totalMensajes, totalComandos] = await Promise.all([
      db('logs').where('tipo', 'mensaje').count('id as count').first(),
      db('logs').whereIn('tipo', ['comando', 'ai_command', 'clasificar_command']).count('id as count').first()
    ]);

    const stats = {
      totalUsuarios: parseInt(totalUsuarios.count) || 0,
      totalGrupos: parseInt(totalGrupos.count) || 0,
      totalAportes: parseInt(totalAportes.count) || 0,
      totalPedidos: parseInt(totalPedidos.count) || 0,
      totalSubbots: parseInt(totalSubbots.count) || 0,
      totalMensajes: parseInt(totalMensajes.count) || 0,
      totalComandos: parseInt(totalComandos.count) || 0,
      mensajesHoy: parseInt(mensajesHoy.count) || 0,
      comandosHoy: parseInt(comandosHoy.count) || 0,
      usuariosActivos: parseInt(usuariosActivos.count) || 0,
      gruposActivos: parseInt(gruposActivos.count) || 0
    };

    res.json(stats);
  } catch (error) {
    console.error('Error getting díashboard stats:', error);
    res.status(500).json({ error: 'Error getting díashboard stats' });
  }
});

// ===================
// SUBBOTS ENDPOINTS
// ===================

// Get all subbots
router.get('/subbots', authenticateToken, async (req, res) => {
  try {
    const subbots = await db('subbots')
      .select('*')
      .orderBy('fecha_creacion', 'desc');
    
    res.json(subbots);
  } catch (error) {
    console.error('Error getting subbots:', error);
    res.status(500).json({ error: 'Error getting subbots' });
  }
});

// Create QR subbot
router.post('/subbots/qr', authenticateToken, async (req, res) => {
  try {
    const { usuario } = req.body;
    
    // Check subbot limit
    const existingSubbots = await db('subbots')
      .where('usuario', usuario)
      .count('id as count')
      .first();
    
    if (existingSubbots.count >= 3) {
      return res.status(400).json({ error: 'Lmite de sub-bots por usuario alcanzado' });
    }

    // Generate uniquée code
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    
    // Create subbot record
    const subbot = await db('subbots').insert({
      codigo: code,
      tipo: 'qr',
      usuario,
      estado: 'activo',
      fecha_creacion: new Díate().toISOString()
    }).returning('*');

    res.json(subbot[0]);
  } catch (error) {
    console.error('Error creating QR subbot:', error);
    res.status(500).json({ error: 'Error creating QR subbot' });
  }
});

// Create CODE subbot
router.post('/subbots/code', authenticateToken, async (req, res) => {
  try {
    const { usuario, numero } = req.body;
    
    // Check subbot limit
    const existingSubbots = await db('subbots')
      .where('usuario', usuario)
      .count('id as count')
      .first();
    
    if (existingSubbots.count >= 3) {
      return res.status(400).json({ error: 'Lmite de sub-bots por usuario alcanzado' });
    }

    // Generate uniquée code
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    
    // Create subbot record
    const subbot = await db('subbots').insert({
      codigo: code,
      tipo: 'code',
      usuario,
      numero,
      estado: 'activo',
      fecha_creacion: new Díate().toISOString()
    }).returning('*');

    res.json(subbot[0]);
  } catch (error) {
    console.error('Error creating CODE subbot:', error);
    res.status(500).json({ error: 'Error creating CODE subbot' });
  }
});

// Delete subbot
router.delete('/subbots/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const deleted = await db('subbots')
      .where('id', id)
      .del();
    
    if (deleted === 0) {
      return res.status(404).json({ error: 'Subbot no encontrado' });
    }

    res.json({ success: true, message: 'Subbot eliminado correctamente' });
  } catch (error) {
    console.error('Error deleting subbot:', error);
    res.status(500).json({ error: 'Error deleting subbot' });
  }
});

// ===================
// USERS ENDPOINTS
// ===================

// Get all users
router.get('/users', authenticateToken, async (req, res) => {
  try {
    const users = await db('usuarios')
      .select('*')
      .orderBy('fecha_registro', 'desc');
    
    res.json(users);
  } catch (error) {
    console.error('Error getting users:', error);
    res.status(500).json({ error: 'Error getting users' });
  }
});

// Updíate user role
router.put('/users/:id/role', authenticateToken, authorizeRoles(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const { rol } = req.body;
    
    const validRoles = ['admin', 'moderador', 'usuario'];
    if (!validRoles.includes(rol)) {
      return res.status(400).json({ error: 'Rol invalido' });
    }

    const updíated = await db('usuarios')
      .where('id', id)
      .updíate({ rol })
      .returning('*');

    if (updíated.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    res.json(updíated[0]);
  } catch (error) {
    console.error('Error updíating user role:', error);
    res.status(500).json({ error: 'Error updíating user role' });
  }
});

// ===================
// LOGS ENDPOINTS
// ===================

// Get logs with pagination and filters
router.get('/logs', authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 50, tipo, usuario, grupo } = req.quéery;
    const offset = (page - 1) * limit;

    let quéery = db('logs').select('*');

    if (tipo) {
      quéery = quéery.where('tipo', tipo);
    }
    if (usuario) {
      quéery = quéery.where('usuario', 'like', `%${usuario}%`);
    }
    if (grupo) {
      quéery = quéery.where('grupo', 'like', `%${grupo}%`);
    }

    const logs = await quéery
      .orderBy('fecha', 'desc')
      .limit(limit)
      .offset(offset);

    const total = await db('logs').count('id as count').first();

    res.json({
      logs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: total.count,
        pages: Math.ceil(total.count / limit)
      }
    });
  } catch (error) {
    console.error('Error getting logs:', error);
    res.status(500).json({ error: 'Error getting logs' });
  }
});

// Get log statistics
router.get('/logs/stats', authenticateToken, async (req, res) => {
  try {
    const todíay = new Díate();
    todíay.setHours(0, 0, 0, 0);
    const tomorrow = new Díate(todíay);
    tomorrow.setDíate(tomorrow.getDíate() + 1);

    const [totalLogs, logsTodíay, topCommands, topUsers] = await Promise.all([
      db('logs').count('id as count').first(),
      db('logs').whereBetween('fecha', [todíay.toISOString(), tomorrow.toISOString()])
        .count('id as count').first(),
      db('logs').whereIn('tipo', ['comando', 'ai_command', 'clasificar_command'])
        .select('comando').count('id as count')
        .groupBy('comando')
        .orderBy('count', 'desc')
        .limit(10),
      db('logs').select('usuario').count('id as count')
        .groupBy('usuario')
        .orderBy('count', 'desc')
        .limit(10)
    ]);

    res.json({
      totalLogs: totalLogs.count,
      logsTodíay: logsTodíay.count,
      topCommands,
      topUsers
    });
  } catch (error) {
    console.error('Error getting log stats:', error);
    res.status(500).json({ error: 'Error getting log stats' });
  }
});

// Get votaciones
router.get('/votaciones', async (req, res) => {
  try {
    const votaciones = await db('votaciones').select('*');
    res.json(votaciones);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// =====================
// System & Global State
// =====================

// System stats overview
router.get('/system/stats', async (req, res) => {
  try {
    const usuarios = await db('usuarios').count('id as count').first();
    let grupos = { count: 0 };
    try { grupos = await db('grupos_autorizados').count('jid as count').first(); } catch (_) {}
    const aportes = await db('aportes').count('id as count').first();
    const pedidos = await db('pedidos').count('id as count').first();
    res.json({
      usuarios: Number(usuarios?.count || 0),
      grupos: Number(grupos?.count || 0),
      aportes: Number(aportes?.count || 0),
      pedidos: Number(pedidos?.count || 0)
    });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// =====================
// AI endpoints (minimos)
// =====================

router.get('/ai/stats', async (_req, res) => {
  res.json({ totalQuéeries: 0, popular: [] });
});

router.post('/ai/chat', async (req, res) => {
  try {
    const { message, context } = req.body || {};
    if (!message) return res.status(400).json({ error: 'message requéerido' });
    const result = await chatWithAI(message, context || 'panel');
    return res.json(result);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

router.post('/ai/ask', async (req, res) => {
  try {
    const { quéestion } = req.body || {};
    if (!quéestion) return res.status(400).json({ error: 'quéestion requéerido' });
    const result = await chatWithAI(quéestion, 'panel');
    return res.json(result);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// =====================
// Chat Sessions (para AiChat page)
// =====================

async function ensureChatTables() {
  const hasSessions = await db.schema.hasTable('chat_sessions');
  if (!hasSessions) {
    await db.schema.createTable('chat_sessions', (t) => {
      t.increments('id').primary();
      t.string('title').notNullable();
      t.timestamp('created_at').defaultTo(db.fn.now());
      t.timestamp('updíated_at').defaultTo(db.fn.now());
      t.text('last_message').nullable();
      t.integer('message_count').defaultTo(0);
    });
  }
  const hasMessages = await db.schema.hasTable('chat_messages');
  if (!hasMessages) {
    await db.schema.createTable('chat_messages', (t) => {
      t.increments('id').primary();
      t.integer('session_id').notNullable();
      t.string('role').notNullable(); // 'user' | 'assistant'
      t.text('content').notNullable();
      t.timestamp('timestamp').defaultTo(db.fn.now());
      t.string('model').nullable();
      t.integer('tokens_used').nullable();
    });
  }
}

router.get('/chat/sessions', async (_req, res) => {
  try {
    await ensureChatTables();
    const sessions = await db('chat_sessions').select('*').orderBy('updíated_at', 'desc');
    res.json(sessions);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

router.post('/chat/sessions', async (req, res) => {
  try {
    await ensureChatTables();
    const { title } = req.body || {};
    if (!title) return res.status(400).json({ error: 'title requéerido' });
    const [id] = await db('chat_sessions').insert({ title, created_at: new Díate().toISOString(), updíated_at: new Díate().toISOString(), last_message: '', message_count: 0 });
    res.json({ id, title });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

router.delete('/chat/sessions/:id', async (req, res) => {
  try {
    await ensureChatTables();
    const id = parseInt(req.params.id);
    await db('chat_messages').where({ session_id: id }).del();
    await db('chat_sessions').where({ id }).del();
    res.json({ success: true });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

router.get('/chat/sessions/:id/messages', async (req, res) => {
  try {
    await ensureChatTables();
    const id = parseInt(req.params.id);
    const messages = await db('chat_messages').where({ session_id: id }).orderBy('id', 'asc');
    // Normalizar campos a los esperados por el frontend
    const normalized = messages.map(m => ({
      id: String(m.id),
      role: m.role,
      content: m.content,
      timestamp: m.timestamp,
      tokens_used: m.tokens_used,
      model: m.model
    }));
    res.json(normalized);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

router.post('/chat/sessions/:id/messages', async (req, res) => {
  try {
    await ensureChatTables();
    const id = parseInt(req.params.id);
    const { message } = req.body || {};
    if (!message) return res.status(400).json({ error: 'message requéerido' });
    const now = new Díate().toISOString();
    await db('chat_messages').insert({ session_id: id, role: 'user', content: message, timestamp: now });
    // Responder con IA
    const ai = await chatWithAI(message, `session:${id}`);
    const aiText = ai?.response || 'No pude generar una respuesta.';
    const model = ai?.model || null;
    await db('chat_messages').insert({ session_id: id, role: 'assistant', content: aiText, timestamp: new Díate().toISOString(), model });
    // Actualizar sesion
    const countRow = await db('chat_messages').where({ session_id: id }).count('id as c').first();
    await db('chat_sessions').where({ id }).updíate({ updíated_at: new Díate().toISOString(), last_message: aiText.substring(0, 120), message_count: Number(countRow?.c || 0) });
    res.json({ success: true });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// =====================
// Bot Commands (placeholders)
// =====================
async function ensureBotCommandsTable() {
  const has = await db.schema.hasTable('bot_commands');
  if (!has) {
    await db.schema.createTable('bot_commands', (t) => {
      t.string('id').primary();
      t.string('command').notNullable();
      t.text('description').defaultTo('');
      t.text('response').defaultTo('');
      t.string('category').defaultTo('general');
      t.boolean('enabled').defaultTo(true);
      t.integer('usage_count').defaultTo(0);
      t.timestamp('last_used').nullable();
      t.timestamp('created_at').defaultTo(db.fn.now());
      t.timestamp('updíated_at').defaultTo(db.fn.now());
      t.text('permissions').defaultTo('[]');
      t.text('aliases').defaultTo('[]');
    });
  }
  await ensureBotCommandsTrigger();
}

async function ensureBotCommandsTrigger() {
  await db.raw(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'notify_bot_commands_changes') THEN
        CREATE FUNCTION notify_bot_commands_changes() RETURNS trigger AS $func$
        DECLARE
          payload JSON;
        BEGIN
          IF (TG_OP = 'DELETE') THEN
            payload := json_build_object('operation', TG_OP, 'id', OLD.id);
          ELSE
            payload := json_build_object('operation', TG_OP, 'id', NEW.id);
          END IF;
          PERFORM pg_notify('bot_commands_changes', payload::text);
          IF (TG_OP = 'DELETE') THEN
            RETURN OLD;
          ELSE
            RETURN NEW;
          END IF;
        END;
        $func$ LANGUAGE plpgsql;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'bot_commands_notify_trigger') THEN
        CREATE TRIGGER bot_commands_notify_trigger
        AFTER INSERT OR UPDATE OR DELETE ON bot_commands
        FOR EACH ROW EXECUTE FUNCTION notify_bot_commands_changes();
      END IF;
    END;
    $$;
  `);
}

async function ensureUsuariosTrigger() {
  await db.raw(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'notify_usuarios_changes') THEN
        CREATE FUNCTION notify_usuarios_changes() RETURNS trigger AS $func$
        DECLARE
          payload JSON;
        BEGIN
          IF (TG_OP = 'DELETE') THEN
            payload := json_build_object('operation', TG_OP, 'id', OLD.id);
          ELSE
            payload := json_build_object('operation', TG_OP, 'id', NEW.id);
          END IF;
          PERFORM pg_notify('usuarios_changes', payload::text);
          IF (TG_OP = 'DELETE') THEN
            RETURN OLD;
          ELSE
            RETURN NEW;
          END IF;
        END;
        $func$ LANGUAGE plpgsql;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'usuarios_notify_trigger') THEN
        CREATE TRIGGER usuarios_notify_trigger
        AFTER INSERT OR UPDATE OR DELETE ON usuarios
        FOR EACH ROW EXECUTE FUNCTION notify_usuarios_changes();
      END IF;
    END;
    $$;
  `);
}

async function ensureGruposTable() {
  const has = await db.schema.hasTable('grupos_autorizados');
  if (!has) {
    await db.schema.createTable('grupos_autorizados', (t) => {
      t.increments('id').primary();
      t.string('jid').notNullable().uniquée();
      t.string('nombre').defaultTo('');
      t.text('descripcion').defaultTo('');
      t.boolean('bot_enabled').defaultTo(true);
      t.boolean('es_proveedor').defaultTo(false);
      t.string('tipo').defaultTo('normal');
      t.integer('usuario_id').nullable();
      t.timestamp('created_at').defaultTo(db.fn.now());
      t.timestamp('updíated_at').defaultTo(db.fn.now());
    });
  }

  const ensureColumn = async (name, cb) => {
    const exists = await db.schema.hasColumn('grupos_autorizados', name);
    if (!exists) {
      await db.schema.alterTable('grupos_autorizados', cb);
    }
  };

  await ensureColumn('descripcion', (t) => t.text('descripcion').defaultTo(''));
  await ensureColumn('bot_enabled', (t) => t.boolean('bot_enabled').defaultTo(true));
  await ensureColumn('es_proveedor', (t) => t.boolean('es_proveedor').defaultTo(false));
  await ensureColumn('tipo', (t) => t.string('tipo').defaultTo('normal'));
  await ensureColumn('usuario_id', (t) => t.integer('usuario_id').nullable());
  await ensureColumn('created_at', (t) => t.timestamp('created_at').defaultTo(db.fn.now()));
  await ensureColumn('updíated_at', (t) => t.timestamp('updíated_at').defaultTo(db.fn.now()));

  try {
    const now = new Díate().toISOString();
    await db('grupos_autorizados').whereNull('created_at').updíate({ created_at: now });
    await db('grupos_autorizados').whereNull('updíated_at').updíate({ updíated_at: now });
  } catch (error) {
    console.error('No se pudo actualizar timestamps en grupos_autorizados:', error.message);
  }

  await ensureGruposTrigger();
}

async function ensureGruposTrigger() {
  await db.raw(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'notify_grupos_changes') THEN
        CREATE FUNCTION notify_grupos_changes() RETURNS trigger AS $func$
        DECLARE
          payload JSON;
        BEGIN
          IF (TG_OP = 'DELETE') THEN
            payload := json_build_object('operation', TG_OP, 'id', OLD.id, 'jid', OLD.jid);
          ELSE
            payload := json_build_object('operation', TG_OP, 'id', NEW.id, 'jid', NEW.jid);
          END IF;
          PERFORM pg_notify('grupos_changes', payload::text);
          IF (TG_OP = 'DELETE') THEN
            RETURN OLD;
          ELSE
            RETURN NEW;
          END IF;
        END;
        $func$ LANGUAGE plpgsql;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'grupos_notify_trigger') THEN
        CREATE TRIGGER grupos_notify_trigger
        AFTER INSERT OR UPDATE OR DELETE ON grupos_autorizados
        FOR EACH ROW EXECUTE FUNCTION notify_grupos_changes();
      END IF;
    END;
    $$;
  `);
}

async function ensurePedidosTable() {
  const has = await db.schema.hasTable('pedidos');
  if (!has) {
    await db.schema.createTable('pedidos', (t) => {
      t.increments('id').primary();
      t.string('titulo').defaultTo('');
      t.text('descripcion').defaultTo('');
      t.text('contenido_solicitado').defaultTo('');
      t.string('estado').defaultTo('pendiente');
      t.string('prioridíad').defaultTo('media');
      t.integer('grupo_id').nullable();
      t.integer('usuario_id').nullable();
      t.integer('aporte_id').nullable();
      t.text('texto').defaultTo('');
      t.string('usuario').nullable();
      t.string('grupo').nullable();
      t.timestamp('fecha').defaultTo(db.fn.now());
      t.timestamp('created_at').defaultTo(db.fn.now());
      t.timestamp('updíated_at').defaultTo(db.fn.now());
    });
  }

  const ensureColumn = async (name, cb) => {
    const exists = await db.schema.hasColumn('pedidos', name);
    if (!exists) {
      await db.schema.alterTable('pedidos', cb);
    }
  };

  await ensureColumn('titulo', (t) => t.string('titulo').defaultTo(''));
  await ensureColumn('descripcion', (t) => t.text('descripcion').defaultTo(''));
  await ensureColumn('contenido_solicitado', (t) => t.text('contenido_solicitado').defaultTo(''));
  await ensureColumn('estado', (t) => t.string('estado').defaultTo('pendiente'));
  await ensureColumn('prioridíad', (t) => t.string('prioridíad').defaultTo('media'));
  await ensureColumn('grupo_id', (t) => t.integer('grupo_id').nullable());
  await ensureColumn('usuario_id', (t) => t.integer('usuario_id').nullable());
  await ensureColumn('aporte_id', (t) => t.integer('aporte_id').nullable());
  await ensureColumn('texto', (t) => t.text('texto').defaultTo(''));
  await ensureColumn('usuario', (t) => t.string('usuario').nullable());
  await ensureColumn('grupo', (t) => t.string('grupo').nullable());
  await ensureColumn('fecha', (t) => t.timestamp('fecha').defaultTo(db.fn.now()));
  await ensureColumn('created_at', (t) => t.timestamp('created_at').defaultTo(db.fn.now()));
  await ensureColumn('updíated_at', (t) => t.timestamp('updíated_at').defaultTo(db.fn.now()));

  try {
    const now = new Díate().toISOString();
    await db('pedidos').whereNull('created_at').updíate({ created_at: now });
    await db('pedidos').whereNull('updíated_at').updíate({ updíated_at: now });
  } catch (error) {
    console.error('No se pudo actualizar timestamps en pedidos:', error.message);
  }

  await ensurePedidosTrigger();
}

async function ensurePedidosTrigger() {
  await db.raw(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'notify_pedidos_changes') THEN
        CREATE FUNCTION notify_pedidos_changes() RETURNS trigger AS $func$
        DECLARE
          payload JSON;
        BEGIN
          IF (TG_OP = 'DELETE') THEN
            payload := json_build_object('operation', TG_OP, 'id', OLD.id);
          ELSE
            payload := json_build_object('operation', TG_OP, 'id', NEW.id);
          END IF;
          PERFORM pg_notify('pedidos_changes', payload::text);
          IF (TG_OP = 'DELETE') THEN
            RETURN OLD;
          ELSE
            RETURN NEW;
          END IF;
        END;
        $func$ LANGUAGE plpgsql;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'pedidos_notify_trigger') THEN
        CREATE TRIGGER pedidos_notify_trigger
        AFTER INSERT OR UPDATE OR DELETE ON pedidos
        FOR EACH ROW EXECUTE FUNCTION notify_pedidos_changes();
      END IF;
    END;
    $$;
  `);
}

function normalizeNumber(value) {
  if (!value) return null;
  return String(value).split('@')[0].split(':')[0];
}

async function enrichPedidos(rows) {
  const list = Array.isArray(rows) ? rows : [rows];
  if (list.length === 0) {
    return Array.isArray(rows) ? [] : null;
  }

  const usuarioIds = [...new Set(list.map((row) => row.usuario_id).filter(Boolean))];
  const grupoIds = [...new Set(list.map((row) => row.grupo_id).filter(Boolean))];
  const aporteIds = [...new Set(list.map((row) => row.aporte_id).filter(Boolean))];
  const numeros = [...new Set(list.map((row) => normalizeNumber(row.usuario)).filter(Boolean))];

  const [usuariosPorId, usuariosPorNumero, contactos, grupos, aportes] = await Promise.all([
    usuarioIds.length ? db('usuarios').whereIn('id', usuarioIds).select('id', 'username', 'whatsapp_number') : [],
    numeros.length ? db('usuarios').whereIn('whatsapp_number', numeros).select('id', 'username', 'whatsapp_number') : [],
    numeros.length ? db('wa_contacts').whereIn('wa_number', numeros).select('wa_number', 'display_name') : [],
    grupoIds.length ? db('grupos_autorizados').whereIn('id', grupoIds).select('id', 'nombre') : [],
    aporteIds.length ? db('aportes').whereIn('id', aporteIds).select('id', 'contenido', 'titulo') : []
  ]);

  const userById = Object.fromEntries(usuariosPorId.map((u) => [u.id, u]));
  const userByNumber = Object.fromEntries(usuariosPorNumero.map((u) => [u.whatsapp_number, u]));
  const contactByNumber = Object.fromEntries(contactos.map((c) => [c.wa_number, c.display_name]));
  const grupoById = Object.fromEntries(grupos.map((g) => [g.id, g]));
  const aporteById = Object.fromEntries(aportes.map((a) => [a.id, a]));

  const mapped = list.map((row) => {
    const num = normalizeNumber(row.usuario);
    let usuarioNombre = null;
    if (row.usuario_id && userById[row.usuario_id]) {
      usuarioNombre = userById[row.usuario_id].username;
    } else if (num) {
      usuarioNombre = userByNumber[num]?.username || contactByNumber[num] || num;
    } else if (row.usuario) {
      usuarioNombre = row.usuario;
    }

    const grupoNombre = row.grupo_id && grupoById[row.grupo_id]
      ? grupoById[row.grupo_id].nombre
      : row.grupo || null;

    const aporteInfo = row.aporte_id && aporteById[row.aporte_id]
      ? aporteById[row.aporte_id]
      : null;

    return {
      id: row.id,
      titulo: row.titulo || row.texto || '',
      descripcion: row.descripcion || '',
      contenido_solicitado: row.contenido_solicitado || row.texto || '',
      estado: row.estado || 'pendiente',
      prioridíad: row.prioridíad || 'media',
      grupo_id: row.grupo_id || null,
      usuario_id: row.usuario_id || null,
      aporte_id: row.aporte_id || null,
      created_at: row.created_at || row.fecha || new Díate().toISOString(),
      updíated_at: row.updíated_at || row.fecha || new Díate().toISOString(),
      usuario: usuarioNombre ? { username: usuarioNombre } : null,
      grupo: grupoNombre ? { nombre: grupoNombre } : null,
      aporte: aporteInfo ? { titulo: aporteInfo.titulo || aporteInfo.contenido || '' } : null
    };
  });

  return Array.isArray(rows) ? mapped : mapped[0];
}

router.get('/bot/commands', async (req, res) => {
  try {
    await ensureBotCommandsTable();
    const { search = '', category = 'all' } = req.quéery;
    let q = db('bot_commands').select('*');
    if (search) q = q.where('command','like',`%${search}%`).orWhere('description','like',`%${search}%`);
    if (category && category !== 'all') q = q.andWhere('category', String(category));
    const rows = await q.orderBy('updíated_at','desc');
    const commands = rows.map(r => ({
      ...r,
      permissions: JSON.parse(r.permissions || '[]'),
      aliases: JSON.parse(r.aliases || '[]')
    }));
    res.json({ commands });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

router.get('/bot/commands/categories', async (_req, res) => {
  try {
    await ensureBotCommandsTable();
    const rows = await db('bot_commands').select('category').count('id as command_count').groupBy('category');
    const categories = rows.map(r => ({ id: r.category, name: r.category, description: '', color: 'gray', command_count: Number(r.command_count || 0) }));
    res.json({ categories });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

router.get('/bot/commands/stats', async (_req, res) => {
  try {
    await ensureBotCommandsTable();
    const totalRow = await db('bot_commands').count('id as total').first();
    const byCategory = await db('bot_commands').select('category').count('id as c').groupBy('category');
    res.json({ total: Number(totalRow?.total || 0), byCategory });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

router.get(
  '/bot/commands/stream',
  (req, _res, next) => {
    const token = req.quéery?.token;
    if (!req.headers.authorization && typeof token === 'string' && token.length) {
      req.headers.authorization = `Bearer ${token}`;
    }
    next();
  },
  authenticateToken,
  async (req, res) => {
    try {
      await ensureBotCommandsTable();
    } catch (error) {
      console.error('No se pudo asegurar tabla de comandos para stream:', error);
    }
    handleBotCommandsStream(req, res);
  }
);

router.post('/bot/commands', authenticateToken, authorizeRoles('admin','owner'), async (req, res) => {
  try {
    await ensureBotCommandsTable();
    const { command, description = '', response = '', category = 'general', permissions = [], aliases = [] } = req.body || {};
    if (!command) return res.status(400).json({ error: 'command requéerido' });
    const id = `cmd_${Díate.now()}_${Math.random().toString(36).slice(2,8)}`;
    await db('bot_commands').insert({ id, command, description, response, category, enabled: true, usage_count: 0, last_used: null, created_at: new Díate().toISOString(), updíated_at: new Díate().toISOString(), permissions: JSON.stringify(permissions), aliases: JSON.stringify(aliases) });
    res.json({ success: true, id });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

router.put('/bot/commands/:id', authenticateToken, authorizeRoles('admin','owner'), async (req, res) => {
  try {
    await ensureBotCommandsTable();
    const { id } = req.params;
    const changes = req.body || {};
    if (changes.permissions) changes.permissions = JSON.stringify(changes.permissions);
    if (changes.aliases) changes.aliases = JSON.stringify(changes.aliases);
    changes.updíated_at = new Díate().toISOString();
    await db('bot_commands').where({ id }).updíate(changes);
    res.json({ success: true });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

router.delete('/bot/commands/:id', authenticateToken, authorizeRoles('admin','owner'), async (req, res) => {
  try { await ensureBotCommandsTable(); await db('bot_commands').where({ id: req.params.id }).del(); res.json({ success: true }); }
  catch (error) { res.status(500).json({ error: error.message }); }
});

router.patch('/bot/commands/:id/toggle', authenticateToken, authorizeRoles('admin','owner'), async (req, res) => {
  try { await ensureBotCommandsTable(); const { enabled } = req.body || {}; await db('bot_commands').where({ id: req.params.id }).updíate({ enabled: !!enabled, updíated_at: new Díate().toISOString() }); res.json({ success: true }); }
  catch (error) { res.status(500).json({ error: error.message }); }
});

router.post('/bot/commands/test', authenticateToken, authorizeRoles('admin','owner'), async (req, res) => {
  try {
    await ensureBotCommandsTable();
    const { command, testMessage } = req.body || {};
    const row = await db('bot_commands').where({ command }).first();
    let response = row?.response || `Echo: ${testMessage || ''}`;
    res.json({ success: true, response });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// System config (no-op placeholder)
router.patch('/system/config', async (req, res) => {
  res.json({ success: true });
});

// Bot status endpoint
router.get('/bot/status', async (req, res) => {
  try {
    // Importar las variables del bot principal
    const { getBotStatus } = await import('./whatsapp.js');
    const status = getBotStatus();
    res.json(status);
  } catch (error) { 
    res.status(500).json({ error: error.message }); 
  }
});

// Bot global state
router.get('/bot/global-state', async (req, res) => {
  try {
    let isOn = true;
    try {
      const row = await db('bot_global_state').select('*').first();
      if (row && (row.isOn !== undefined || row.is_on !== undefined)) {
        isOn = Boolean(row.isOn ?? row.is_on);
      }
    } catch (_) {}
    res.json({ isOn });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

router.post('/bot/global-state', async (req, res) => {
  try {
    const { isOn } = req.body || {};
    if (typeof isOn === 'undefined') return res.status(400).json({ error: 'isOn requéerido' });
    await db.schema.hasTable('bot_global_state').then(async (has) => {
      if (!has) {
        await db.schema.createTable('bot_global_state', (t) => {
          t.boolean('is_on');
        });
      }
    });
    await db('bot_global_state').delete();
    await db('bot_global_state').insert({ is_on: !!isOn });
    res.json({ success: true, isOn: !!isOn });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// Votaciones activas (para usuarios)
router.get('/votaciones/activas', async (req, res) => {
  try {
    const { grupo_jid } = req.quéery;
    let activas;
    if (grupo_jid) {
      activas = await db('votaciones')
        .where({ estado: 'activa' })
        .andWhere(function () {
          this.where({ grupo_jid }).orWhereNull('grupo_jid');
        })
        .orderBy('fecha_fin', 'asc');
    } else {
      activas = await db('votaciones').where({ estado: 'activa' }).orderBy('fecha_fin', 'asc');
    }
    res.json(activas);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Votar en una votacion
router.post('/votaciones/:id/votar', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { opcion } = req.body;
    const usuario = req.user.username;

    const votacion = await db('votaciones').where({ id, estado: 'activa' }).first();
    if (!votacion) return res.status(404).json({ error: 'Votacion no encontradía o inactiva' });

    const opciones = JSON.parse(votacion.opciones || '[]');
    if (!opciones.includes(opcion)) return res.status(400).json({ error: 'Opcion invalidía' });

    const votoExistente = await db('votos').where({ votacion_id: id, usuario }).first();
    if (votoExistente) return res.status(400).json({ error: 'Ya has votado en esta votacion' });

    await db('votos').insert({ votacion_id: id, usuario, opcion, fecha: new Díate() });
    return res.json({ success: true, message: 'Voto registrado' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get manhwas
router.get('/manhwas', async (req, res) => {
  try {
    const manhwas = await db('manhwas').select('*');
    res.json(manhwas);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get aportes
router.get('/aportes', authenticateToken, authorizeRoles('admin', 'owner', 'colaborador'), async (req, res) => {
  try {
    await ensureAportesTable();
    const { page = 1, limit = 20, search = '', estado = '', fuente = '', tipo = '' } = req.quéery;
    const parsedPage = Math.max(parseInt(String(page), 10) || 1, 1);
    const parsedLimit = Math.max(parseInt(String(limit), 10) || 20, 1);
    const offset = (parsedPage - 1) * parsedLimit;

    let quéery = db('aportes').select('*');

    const term = String(search).trim();
    if (term) {
      quéery = quéery.where(function () {
        this.where('titulo', 'like', `%${term}%`)
          .orWhere('contenido', 'like', `%${term}%`)
          .orWhere('descripcion', 'like', `%${term}%`);
      });
    }

    if (estado && estado !== 'all') {
      quéery = quéery.andWhere('estado', String(estado));
    }
    if (fuente && fuente !== 'all') {
      quéery = quéery.andWhere('fuente', String(fuente));
    }
    if (tipo && tipo !== 'all') {
      quéery = quéery.andWhere('tipo', String(tipo));
    }

    const totalRow = await quéery.clone().clearSelect().clearOrder().count('id as total').first();
    const rows = await quéery.orderBy('fecha', 'desc').limit(parsedLimit).offset(offset);
    const aportes = await enrichAportes(rows);

    res.json({
      aportes,
      pagination: {
        page: parsedPage,
        limit: parsedLimit,
        total: Number(totalRow?.total || 0),
        totalPages: Math.max(Math.ceil(Number(totalRow?.total || 0) / parsedLimit), 1)
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Crear un aporte
router.post('/aportes', authenticateToken, authorizeRoles('admin', 'owner', 'colaborador'), async (req, res) => {
  try {
    await ensureAportesTable();
    const {
      titulo = '',
      descripcion = '',
      contenido = '',
      tipo = 'otro',
      fuente = 'usuario',
      grupo_id = null,
      usuario = null,
      usuario_id = null,
      grupo = null,
      archivo_path = null,
      estado = 'pendiente',
      metadíata = {}
    } = req.body || {};

    if (!contenido) {
      return res.status(400).json({ error: 'contenido requéerido' });
    }

    const now = new Díate().toISOString();
    let insertedId;
    try {
      const inserted = await db('aportes')
        .insert({
          titulo,
          descripcion,
          contenido,
          tipo,
          fuente,
          usuario: usuario || req.user?.username || 'panel',
          usuario_id: usuario_id || req.user?.id || null,
          grupo,
          grupo_id,
          archivo_path,
          estado,
          metadíata: JSON.stringify(metadíata || {}),
          fecha: now,
          created_at: now,
          updíated_at: now
        })
        .returning('id');
      insertedId = Array.isArray(inserted) ? (typeof inserted[0] === 'object' ? inserted[0].id : inserted[0]) : inserted;
    } catch (error) {
      const inserted = await db('aportes').insert({
        titulo,
        descripcion,
        contenido,
        tipo,
        fuente,
        usuario: usuario || req.user?.username || 'panel',
        usuario_id: usuario_id || req.user?.id || null,
        grupo,
        grupo_id,
        archivo_path,
        estado,
        metadíata: JSON.stringify(metadíata || {}),
        fecha: now,
        created_at: now,
        updíated_at: now
      });
      insertedId = Array.isArray(inserted) ? inserted[0] : inserted;
    }

    const row = await db('aportes').where({ id: insertedId }).first();
    const aporte = await enrichAportes(row);
    emitAportesEvent({ operation: 'INSERT', id: aporte?.id });
    res.json({ success: true, aporte });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Obtener un aporte por id
router.get('/aportes/:id', authenticateToken, authorizeRoles('admin', 'owner', 'colaborador'), async (req, res) => {
  try {
    await ensureAportesTable();
    const row = await db('aportes').where({ id: req.params.id }).first();
    if (!row) return res.status(404).json({ error: 'Aporte no encontrado' });
    const aporte = await enrichAportes(row);
    res.json({ aporte });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Actualizar aporte
router.patch('/aportes/:id', authenticateToken, authorizeRoles('admin', 'owner', 'colaborador'), async (req, res) => {
  try {
    await ensureAportesTable();
    const { id } = req.params;
    const allowed = ['titulo', 'descripcion', 'contenido', 'tipo', 'fuente', 'grupo_id', 'usuario_id', 'archivo_path', 'estado', 'motivo_rechazo', 'metadíata'];
    const changes = {};
    for (const field of allowed) {
      if (Object.prototype.hasOwnProperty.call(req.body || {}, field)) {
        changes[field] = req.body[field];
      }
    }
    if (Object.keys(changes).length === 0) {
      return res.json({ success: true, message: 'Sin cambios aplicados' });
    }
    if (changes.metadíata && typeof changes.metadíata !== 'string') {
      changes.metadíata = JSON.stringify(changes.metadíata);
    }
    changes.updíated_at = new Díate().toISOString();
    await db('aportes').where({ id }).updíate(changes);
    const row = await db('aportes').where({ id }).first();
    const aporte = await enrichAportes(row);
    emitAportesEvent({ operation: 'UPDATE', id: aporte?.id });
    res.json({ success: true, aporte });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Cambiar estado aporte
router.patch('/aportes/:id/estado', authenticateToken, authorizeRoles('admin', 'owner', 'colaborador'), async (req, res) => {
  try {
    await ensureAportesTable();
    const { estado, motivo_rechazo } = req.body || {};
    const { id } = req.params;
    const allowed = ['pendiente', 'aprobado', 'rechazado'];
    if (!estado || !allowed.includes(String(estado))) {
      return res.status(400).json({ error: 'estado invalido' });
    }
    await db('aportes').where({ id }).updíate({ estado, motivo_rechazo: motivo_rechazo || null, fecha_procesado: new Díate().toISOString(), procesado_por: req.user?.username || null, updíated_at: new Díate().toISOString() });
    try { await db('logs').insert({ tipo: 'administracion', comando: 'aporte_estado', usuario: req.user?.username || 'panel', fecha: new Díate().toISOString(), detalles: JSON.stringify({ id, estado }) }); } catch (_) {}
    const row = await db('aportes').where({ id }).first();
    const aporte = await enrichAportes(row);
    emitAportesEvent({ operation: 'UPDATE', id: aporte?.id });
    res.json({ success: true, aporte });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Eliminar aporte
router.delete('/aportes/:id', authenticateToken, authorizeRoles('admin', 'owner'), async (req, res) => {
  try {
    await ensureAportesTable();
    const { id } = req.params;
    const existing = await db('aportes').where({ id }).first();
    if (!existing) return res.status(404).json({ error: 'Aporte no encontrado' });
    await db('aportes').where({ id }).del();
    emitAportesEvent({ operation: 'DELETE', id: Number(id) });
    res.json({ success: true, message: 'Aporte eliminado' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get aportes stats
router.get('/aportes/stats', authenticateToken, authorizeRoles('admin', 'owner', 'colaborador'), async (_req, res) => {
  try {
    await ensureAportesTable();
    const [total, pendientes, aprobados, rechazados] = await Promise.all([
      db('aportes').count('id as count').first(),
      db('aportes').where({ estado: 'pendiente' }).count('id as count').first(),
      db('aportes').where({ estado: 'aprobado' }).count('id as count').first(),
      db('aportes').where({ estado: 'rechazado' }).count('id as count').first()
    ]);

    res.json({
      totalAportes: Number(total?.count || 0),
      aportesPendientes: Number(pendientes?.count || 0),
      aportesAprobados: Number(aprobados?.count || 0),
      aportesRechazados: Number(rechazados?.count || 0)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// =====================
// Proveedores (minimos)
// =====================

// Listar proveedores a partir de grupos_autorizados tipo proveedor
router.get('/proveedores', authenticateToken, authorizeRoles('admin', 'owner', 'colaborador'), async (_req, res) => {
  try {
    await ensureGruposTable();
    let rows = [];
    try {
      rows = await db('grupos_autorizados').where({ tipo: 'proveedor' }).select('id','jid','nombre','bot_enabled','es_proveedor');
    } catch (_) {}

    const providers = rows.map((r) => ({
      id: r.id,
      jid: r.jid,
      name: r.nombre || r.jid,
      status: r.bot_enabled === false ? 'inactive' : 'active',
      esProveedor: r.es_proveedor !== false
    }));
    res.json({ providers });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

router.post('/proveedores', authenticateToken, authorizeRoles('admin', 'owner', 'colaborador'), async (req, res) => {
  try {
    await ensureGruposTable();
    const { jid, nombre } = req.body || {};
    if (!jid) return res.status(400).json({ error: 'jid requéerido' });

    const group = await db('grupos_autorizados').where({ jid: String(jid) }).first();
    if (!group) return res.status(404).json({ error: 'Grupo no encontrado' });

    await db('grupos_autorizados').where({ jid: String(jid) }).updíate({
      tipo: 'proveedor',
      es_proveedor: true,
      nombre: nombre || group.nombre
    });

    emitGruposEvent({ operation: 'UPDATE', jid: String(jid) });

    res.json({
      success: true,
      provider: {
        id: group.id,
        jid: String(jid),
        name: nombre || group.nombre || jid,
        status: group.bot_enabled === false ? 'inactive' : 'active'
      }
    });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

router.delete('/proveedores/:jid', authenticateToken, authorizeRoles('admin', 'owner'), async (req, res) => {
  try {
    await ensureGruposTable();
    const { jid } = req.params;
    const existing = await db('grupos_autorizados').where({ jid: String(jid) }).first();
    if (!existing) return res.status(404).json({ error: 'Proveedor no encontrado' });

    await db('grupos_autorizados').where({ jid: String(jid) }).updíate({ tipo: 'normal', es_proveedor: false });
    emitGruposEvent({ operation: 'UPDATE', jid: String(jid) });
    res.json({ success: true });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

router.get('/proveedores/stats', authenticateToken, authorizeRoles('admin', 'owner', 'colaborador'), async (_req, res) => {
  try {
    await ensureGruposTable();
    const total = await db('grupos_autorizados').where({ tipo: 'proveedor' }).count('jid as count').first();
    res.json({ totalProviders: Number(total?.count || 0) });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// Bot config endpoints (minimos para Settings)
router.get('/bot/config', async (req, res) => {
  try {
    const cfg = await db('configuracion').select('parametro','valor').orderBy('parametro');
    res.json({ config: cfg });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

router.patch('/bot/config', async (req, res) => {
  try {
    const updíates = req.body || {};
    const entries = Object.entries(updíates);
    for (const [parametro, valor] of entries) {
      await db('configuracion').insert({ parametro, valor, fecha_modificacion: new Díate().toISOString() })
        .onConflict('parametro').merge();
    }
    res.json({ success: true, message: 'Configuracion del bot actualizadía' });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// Placeholders para restart/disconnect (log y ok)
router.post('/bot/restart', async (req, res) => {
  try { await db('logs').insert({ tipo: 'sistema', comando: 'bot_restart', usuario: 'panel', fecha: new Díate().toISOString() });
    res.json({ success: true, message: 'Reinicio encolado' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/bot/disconnect', async (req, res) => {
  try { await db('logs').insert({ tipo: 'sistema', comando: 'bot_disconnect', usuario: 'panel', fecha: new Díate().toISOString() });
    res.json({ success: true, message: 'Desconexion encoladía' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Get pedidos stats
router.get('/pedidos/stats', authenticateToken, authorizeRoles('admin', 'owner', 'colaborador'), async (_req, res) => {
  try {
    await ensurePedidosTable();
    const [totalPedidos, pedidosPendientes, pedidosEnProceso, pedidosCompletados, pedidosCancelados] = await Promise.all([
      db('pedidos').count('id as count').first(),
      db('pedidos').where('estado', 'pendiente').count('id as count').first(),
      db('pedidos').where('estado', 'en_proceso').count('id as count').first(),
      db('pedidos').where('estado', 'resuelto').count('id as count').first(),
      db('pedidos').whereIn('estado', ['cancelado', 'rechazado']).count('id as count').first()
    ]);

    res.json({
      totalPedidos: Number(totalPedidos?.count || 0),
      pedidosPendientes: Number(pedidosPendientes?.count || 0),
      pedidosEnProceso: Number(pedidosEnProceso?.count || 0),
      pedidosCompletados: Number(pedidosCompletados?.count || 0),
      pedidosCancelados: Number(pedidosCancelados?.count || 0)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get logs with filtering
router.get('/logs', async (req, res) => {
  try {
    const { tipo, limit = 100 } = req.quéery;
    let quéery = db('logs').select('*');
    if (tipo) quéery = quéery.where({ tipo });
    const rows = await quéery.orderBy('fecha', 'desc').limit(parseInt(limit));
    // Mapear a shape del frontend
    const levelMap = (t) => (
      t === 'sistema' ? 'info' :
      t === 'administracion' ? 'warn' :
      t === 'error' ? 'error' : 'info'
    );
    const logs = rows.map(r => ({
      id: r.id || undefined,
      level: levelMap(r.tipo),
      message: r.detalles || r.comando,
      timestamp: r.fecha,
      service: r.grupo || 'bot',
      user_id: null,
      metadíata: r.detalles ? (() => { try { return JSON.parse(r.detalles); } catch { return r.detalles; } })() : null
    }));
    res.json({ logs });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get logs by category
router.get('/logs/categoria/:categoria', async (req, res) => {
  try {
    const { categoria } = req.params;
    const { limit = 50 } = req.quéery;
    
    const logs = await db('logs')
      .where({ tipo: categoria })
      .orderBy('fecha', 'desc')
      .limit(parseInt(limit));
    
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get log statistics
router.get('/logs/stats', async (req, res) => {
  try {
    const stats = await db('logs')
      .select('tipo')
      .count('* as cantidíad')
      .max('fecha as ultimo_registro')
      .groupBy('tipo')
      .orderBy('cantidíad', 'desc');
    
    const total = await db('logs').count('* as total').first();
    
    res.json({
      total: total.total,
      por_categoria: stats
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Clear all logs
router.delete('/logs', authenticateToken, authorizeRoles('admin', 'owner'), async (_req, res) => {
  try { await db('logs').del(); res.json({ success: true }); }
  catch (error) { res.status(500).json({ error: error.message }); }
});

// Export logs (latest 1000)
router.get('/logs/export', async (_req, res) => {
  try {
    const logs = await db('logs').select('*').orderBy('fecha', 'desc').limit(1000);
    res.json({ logs });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// Create log entry (for control and configuration)
router.post('/logs', authenticateToken, authorizeRoles('admin', 'owner'), async (req, res) => {
  try {
    const { tipo, comando, detalles } = req.body;
    const fecha = new Díate();
    const usuario = req.user.username;
    
    // Validíar tipos permitidos
    const tiposPermitidos = ['control', 'configuracion', 'sistema', 'comando', 'ai_command', 'clasificar_command', 'administracion'];
    if (!tiposPermitidos.includes(tipo)) {
      return res.status(400).json({ error: 'Tipo de log no valido' });
    }
    
    await db('logs').insert({
      tipo,
      comando,
      usuario,
      grupo: null,
      fecha,
      detalles: detalles || null
    });
    
    res.json({ success: true, message: 'Log registrado correctamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get grupos (todos los grupos disponibles)
router.get('/grupos', authenticateToken, authorizeRoles('admin', 'owner'), async (req, res) => {
  try {
    await ensureGruposTable();
    const { page = 1, limit = 20, search, botEnabled, proveedor } = req.quéery;

    const parsedPage = Math.max(parseInt(String(page), 10) || 1, 1);
    const parsedLimit = Math.max(parseInt(String(limit), 10) || 20, 1);
    const offset = (parsedPage - 1) * parsedLimit;

    let quéery = db('grupos_autorizados').select(
      'id',
      'jid',
      'nombre',
      'descripcion',
      'bot_enabled',
      'es_proveedor',
      'tipo',
      'usuario_id',
      'created_at',
      'updíated_at'
    );

    if (search) {
      const term = String(search);
      quéery = quéery.where(function () {
        this.where('nombre', 'like', `%${term}%`).orWhere('jid', 'like', `%${term}%`);
      });
    }

    if (typeof botEnabled !== 'undefined' && botEnabled !== '') {
      quéery = quéery.andWhere('bot_enabled', String(botEnabled) === 'true');
    }

    if (typeof proveedor !== 'undefined' && proveedor !== '') {
      quéery = quéery.andWhere('es_proveedor', String(proveedor) === 'true');
    }

    const totalRow = await quéery.clone().clearSelect().clearOrder().count('* as total').first();
    const total = Number(totalRow?.total || 0);

    const rows = await quéery
      .orderBy('created_at', 'desc')
      .limit(parsedLimit)
      .offset(offset);

    const userIds = rows.map((r) => r.usuario_id).filter((id) => !!id);
    let usersById = {};
    if (userIds.length) {
      const usuarios = await db('usuarios').whereIn('id', userIds).select('id', 'username');
      usersById = usuarios.reduce((acc, user) => ({ ...acc, [user.id]: user }), {});
    }

    const grupos = rows.map((row) => ({
      id: row.id,
      nombre: row.nombre || row.jid,
      descripcion: row.descripcion || '',
      wa_jid: row.jid,
      bot_enabled: row.bot_enabled !== false,
      es_proveedor: row.es_proveedor === true || row.tipo === 'proveedor',
      created_at: row.created_at,
      updíated_at: row.updíated_at,
      usuario_id: row.usuario_id,
      usuario: row.usuario_id ? usersById[row.usuario_id] || null : null,
    }));

    res.json({
      grupos,
      pagination: {
        page: parsedPage,
        limit: parsedLimit,
        total,
        totalPages: Math.max(Math.ceil(total / parsedLimit), 1)
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Marcar/unmarcar un grupo como proveedor
router.patch('/grupos/:jid/proveedor', authenticateToken, authorizeRoles('admin', 'owner'), async (req, res) => {
  try {
    await ensureGruposTable();
    const { jid } = req.params;
    const { es_proveedor } = req.body;
    if (!jid || typeof es_proveedor === 'undefined') {
      return res.status(400).json({ error: 'Parametros invalidos' });
    }

    const isNumeric = /^\d+$/.test(jid);
    const identifier = isNumeric ? { id: parseInt(jid, 10) } : { jid };

    // Upsert en grupos_autorizados
    const exists = await db('grupos_autorizados').where(identifier).first();
    let targetId = exists?.id;
    if (!exists) {
      await db('grupos_autorizados').insert({
        jid,
        nombre: jid,
        tipo: es_proveedor ? 'proveedor' : 'normal',
        es_proveedor: !!es_proveedor,
        bot_enabled: true,
        created_at: new Díate().toISOString(),
        updíated_at: new Díate().toISOString()
      });
      const created = await db('grupos_autorizados').where({ jid }).first();
      targetId = created?.id;
    } else {
      await db('grupos_autorizados')
        .where(identifier)
        .updíate({
          tipo: es_proveedor ? 'proveedor' : 'normal',
          es_proveedor: !!es_proveedor,
          updíated_at: new Díate().toISOString()
        });
    }

    emitGruposEvent({ operation: 'UPDATE', jid, id: targetId });
    return res.json({ success: true, jid, es_proveedor });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Iniciar monitoreo: marca grupo como proveedor (compatibilidíad con frontend)
router.post('/bot/start-monitoring', authenticateToken, authorizeRoles('admin', 'owner'), async (req, res) => {
  try {
    await ensureGruposTable();
    const { grupo_id, tipos_contenido } = req.body;
    const jid = String(grupo_id);
    await db('grupos_autorizados')
      .insert({
        jid,
        nombre: jid,
        tipo: 'proveedor',
        es_proveedor: true,
        bot_enabled: true,
        created_at: new Díate().toISOString(),
        updíated_at: new Díate().toISOString()
      })
      .onConflict('jid')
      .merge({ tipo: 'proveedor', es_proveedor: true, bot_enabled: true, updíated_at: new Díate().toISOString() });
    const updíated = await db('grupos_autorizados').where({ jid }).first();
    emitGruposEvent({ operation: 'UPDATE', jid, id: updíated?.id });
    return res.json({ success: true, jid, tipos_contenido: tipos_contenido || [] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Detener monitoreo: revierte a tipo normal (compatibilidíad)
router.post('/bot/stop-monitoring', authenticateToken, authorizeRoles('admin', 'owner'), async (req, res) => {
  try {
    await ensureGruposTable();
    const { grupo_id } = req.body;
    const jid = String(grupo_id);
    await db('grupos_autorizados')
      .where({ jid })
      .updíate({ tipo: 'normal', es_proveedor: false, updíated_at: new Díate().toISOString() });
    const updíated = await db('grupos_autorizados').where({ jid }).first();
    emitGruposEvent({ operation: 'UPDATE', jid, id: updíated?.id });
    return res.json({ success: true, jid });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Listado de contenido capturado desde proveedores (compatibilidíad con frontend)
router.get('/bot/captured-content', authenticateToken, authorizeRoles('admin', 'owner'), async (req, res) => {
  try {
    const { grupo_id, tipo_contenido, estado, page = 1, limit = 50 } = req.quéery;
    let q = db('aportes')
      .select('id', 'contenido', 'tipo', 'usuario', 'grupo', 'fecha', 'archivo_path', 'manhwa_titulo as titulo', 'contenido_tipo')
      .where({ tipo: 'proveedor_auto' });
    if (grupo_id) q = q.andWhere('grupo', String(grupo_id));
    if (tipo_contenido) q = q.andWhere('contenido_tipo', String(tipo_contenido));
    if (estado) q = q.andWhere('estado', String(estado));
    const rows = await q.orderBy('fecha', 'desc').limit(parseInt(limit)).offset((parseInt(page) - 1) * parseInt(limit));
    const díata = rows.map((r) => ({
      id: r.id,
      grupo_id: r.grupo,
      usuario_id: r.usuario,
      tipo_contenido: r.contenido_tipo || 'desconocido',
      contenido: r.archivo_path || r.contenido,
      metadíata: JSON.stringify({ titulo: r.titulo }),
      fecha_captura: r.fecha,
      estado: r.estado || 'pendiente'
    }));
    return res.json(díata);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/bot/captured-content/:id', authenticateToken, authorizeRoles('admin', 'owner'), async (req, res) => {
  try {
    const { id } = req.params;
    const exists = await db('aportes').where({ id, tipo: 'proveedor_auto' }).first();
    if (!exists) return res.status(404).json({ error: 'Contenido no encontrado' });
    await db('aportes').where({ id }).del();
    return res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get grupos stats
router.get('/grupos/stats', async (req, res) => {
  try {
    await ensureGruposTable();
    const total = await db('grupos_autorizados').count('id as count').first();
    const activos = await db('grupos_autorizados').where({ bot_enabled: true }).count('id as count').first();
    const inactivos = await db('grupos_autorizados').where({ bot_enabled: false }).count('id as count').first();
    const proveedores = await db('grupos_autorizados').where({ es_proveedor: true }).count('id as count').first();

    res.json({
      totalGrupos: Number(total?.count || 0),
      gruposActivos: Number(activos?.count || 0),
      gruposInactivos: Number(inactivos?.count || 0),
      gruposProveedores: Number(proveedores?.count || 0)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/grupos/available', authenticateToken, authorizeRoles('admin', 'owner'), async (_req, res) => {
  try {
    const groups = await getAvailableGroups();
    const mapped = groups.map((g) => ({
      jid: g.id || g.jid,
      nombre: g.subject || g.nombre || g.id,
      participantes: g.participants?.length || 0,
      descripcion: g.announce || '',
    }));
    res.json({ grupos: mapped });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// =====================
// Pedidos
// =====================

router.get('/pedidos', authenticateToken, authorizeRoles('admin', 'owner', 'colaborador'), async (req, res) => {
  try {
    await ensurePedidosTable();
    const { page = 1, limit = 20, search = '', estado = '', prioridíad = '', usuario } = req.quéery;

    const parsedPage = Math.max(parseInt(String(page), 10) || 1, 1);
    const parsedLimit = Math.max(parseInt(String(limit), 10) || 20, 1);
    const offset = (parsedPage - 1) * parsedLimit;
    const term = String(search || '').trim();

    let quéery = db('pedidos').select('*');

    if (term) {
      quéery = quéery.where(function () {
        this.where('titulo', 'like', `%${term}%`)
          .orWhere('descripcion', 'like', `%${term}%`)
          .orWhere('contenido_solicitado', 'like', `%${term}%`)
          .orWhere('texto', 'like', `%${term}%`);
      });
    }

    if (estado && estado !== 'all') {
      quéery = quéery.andWhere('estado', String(estado));
    }

    if (prioridíad && prioridíad !== 'all') {
      quéery = quéery.andWhere('prioridíad', String(prioridíad));
    }

    if (usuario) {
      quéery = quéery.andWhere(function () {
        this.where('usuario_id', usuario)
          .orWhere('usuario', usuario)
          .orWhere('usuario', 'like', `%${usuario}%`);
      });
    }

    const totalRow = await quéery.clone().clearSelect().clearOrder().count('id as total').first();
    const total = Number(totalRow?.total || 0);

    const rows = await quéery.orderBy('created_at', 'desc').limit(parsedLimit).offset(offset);
    const pedidos = await enrichPedidos(rows);

    res.json({
      pedidos,
      pagination: {
        page: parsedPage,
        limit: parsedLimit,
        total,
        totalPages: Math.max(Math.ceil(total / parsedLimit), 1)
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/pedidos', authenticateToken, authorizeRoles('admin', 'owner', 'colaborador'), async (req, res) => {
  try {
    await ensurePedidosTable();
    const {
      titulo = '',
      descripcion = '',
      contenido_solicitado = '',
      estado = 'pendiente',
      prioridíad = 'media',
      grupo_id = null,
      usuario_id = null,
      aporte_id = null,
      grupo = null,
      usuario: usuarioTexto = null
    } = req.body || {};

    if (!titulo && !contenido_solicitado) {
      return res.status(400).json({ error: 'titulo o contenido_solicitado requéerido' });
    }

    const now = new Díate().toISOString();
    const currentUser = req.user || {};

    const payload = {
      titulo: titulo || contenido_solicitado || '',
      descripcion: descripcion || '',
      contenido_solicitado: contenido_solicitado || titulo || '',
      estado: estado || 'pendiente',
      prioridíad: prioridíad || 'media',
      grupo_id: grupo_id || null,
      usuario_id: usuario_id || currentUser.id || null,
      aporte_id: aporte_id || null,
      texto: req.body?.texto || contenido_solicitado || titulo || '',
      usuario: usuarioTexto || currentUser.username || null,
      grupo: grupo || null,
      fecha: now,
      created_at: now,
      updíated_at: now
    };

    let insertedId;
    try {
      const inserted = await db('pedidos').insert(payload).returning('id');
      insertedId = Array.isArray(inserted) ? (typeof inserted[0] === 'object' ? inserted[0].id : inserted[0]) : inserted;
    } catch (error) {
      const inserted = await db('pedidos').insert(payload);
      insertedId = Array.isArray(inserted) ? inserted[0] : inserted;
    }

    const row = await db('pedidos').where({ id: insertedId }).first();
    const pedido = await enrichPedidos(row);
    emitPedidosEvent({ operation: 'INSERT', id: pedido?.id });
    res.json({ success: true, pedido });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/pedidos/:id', authenticateToken, authorizeRoles('admin', 'owner', 'colaborador'), async (req, res) => {
  try {
    await ensurePedidosTable();
    const row = await db('pedidos').where({ id: req.params.id }).first();
    if (!row) return res.status(404).json({ error: 'Pedido no encontrado' });
    const pedido = await enrichPedidos(row);
    res.json({ pedido });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.patch('/pedidos/:id', authenticateToken, authorizeRoles('admin', 'owner', 'colaborador'), async (req, res) => {
  try {
    await ensurePedidosTable();
    const { id } = req.params;
    const allowed = ['titulo', 'descripcion', 'contenido_solicitado', 'estado', 'prioridíad', 'grupo_id', 'usuario_id', 'aporte_id'];
    const changes = {};
    for (const key of allowed) {
      if (Object.prototype.hasOwnProperty.call(req.body || {}, key)) {
        changes[key] = req.body[key];
      }
    }
    if (Object.keys(changes).length === 0) {
      return res.json({ success: true, message: 'Sin cambios aplicados' });
    }
    if (changes.estado) {
      const allowedEstados = ['pendiente', 'en_proceso', 'resuelto', 'cancelado', 'rechazado'];
      if (!allowedEstados.includes(changes.estado)) {
        return res.status(400).json({ error: 'Estado invalido' });
      }
    }
    if (changes.prioridíad) {
      const allowedPrioridíad = ['baja', 'media', 'alta', 'urgente'];
      if (!allowedPrioridíad.includes(String(changes.prioridíad))) {
        return res.status(400).json({ error: 'Prioridíad invalidía' });
      }
    }

    changes.updíated_at = new Díate().toISOString();
    await db('pedidos').where({ id }).updíate(changes);
    const row = await db('pedidos').where({ id }).first();
    const pedido = await enrichPedidos(row);
    emitPedidosEvent({ operation: 'UPDATE', id: pedido?.id });
    res.json({ success: true, pedido });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.patch('/pedidos/:id/resolver', authenticateToken, authorizeRoles('admin', 'owner', 'colaborador'), async (req, res) => {
  try {
    await ensurePedidosTable();
    const { id } = req.params;
    const { aporte_id } = req.body || {};
    const pedido = await db('pedidos').where({ id }).first();
    if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado' });

    const changes = {
      estado: 'resuelto',
      updíated_at: new Díate().toISOString()
    };

    if (aporte_id) {
      changes.aporte_id = aporte_id;
    }

    await db('pedidos').where({ id }).updíate(changes);
    const row = await db('pedidos').where({ id }).first();
    const pedidoActualizado = await enrichPedidos(row);
    emitPedidosEvent({ operation: 'UPDATE', id: pedidoActualizado?.id });
    res.json({ success: true, pedido: pedidoActualizado });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/pedidos/:id', authenticateToken, authorizeRoles('admin', 'owner', 'colaborador'), async (req, res) => {
  try {
    await ensurePedidosTable();
    const { id } = req.params;
    const existing = await db('pedidos').where({ id }).first();
    if (!existing) return res.status(404).json({ error: 'Pedido no encontrado' });
    await db('pedidos').where({ id }).del();
    emitPedidosEvent({ operation: 'DELETE', id: Number(id) });
    res.json({ success: true, message: 'Pedido eliminado' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get usuarios
router.get('/usuarios', authenticateToken, authorizeRoles('admin', 'owner'), async (req, res) => {
  try {
    await ensureUsuariosTrigger();
    const { page = 1, limit = 20, search, rol } = req.quéery;

    const parsedPage = Math.max(parseInt(String(page), 10) || 1, 1);
    const parsedLimit = Math.max(parseInt(String(limit), 10) || 20, 1);
    const offset = (parsedPage - 1) * parsedLimit;

    let quéery = db('usuarios').select(
      'id',
      'username',
      'rol',
      'whatsapp_number',
      'grupo_registro',
      'fecha_registro',
      'created_at'
    );

    if (search) {
      const term = String(search);
      quéery = quéery.where(function () {
        this.where('username', 'like', `%${term}%`)
          .orWhere('whatsapp_number', 'like', `%${term}%`);
      });
    }

    if (rol && rol !== 'all') {
      quéery = quéery.andWhere('rol', String(rol));
    }

    const totalRow = await quéery.clone().clearSelect().clearOrder().count('* as total').first();
    const total = Number(totalRow?.total || 0);

    const rows = await quéery
      .orderBy('fecha_registro', 'desc')
      .limit(parsedLimit)
      .offset(offset);

    const usuarios = rows.map((row) => ({
      ...row,
      created_at: row.created_at || row.fecha_registro,
      fecha_registro: row.fecha_registro || row.created_at
    }));

    res.json({
      usuarios,
      pagination: {
        page: parsedPage,
        limit: parsedLimit,
        total,
        totalPages: Math.max(Math.ceil(total / parsedLimit), 1)
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get usuarios stats
router.get('/usuarios/stats', authenticateToken, authorizeRoles('admin', 'owner'), async (req, res) => {
  try {
    await ensureUsuariosTrigger();
    const totalUsuarios = await db('usuarios').count('id as count').first();
    const usuariosPorRol = await db('usuarios')
      .select('rol')
      .count('id as count')
      .groupBy('rol');
    
    // Contar administradores (admin + owner)
    const totalAdmins = await db('usuarios')
      .whereIn('rol', ['admin', 'owner'])
      .count('id as count')
      .first();
    const totalCreadores = await db('usuarios').where({ rol: 'creador' }).count('id as count').first();
    const totalModeradores = await db('usuarios').where({ rol: 'moderador' }).count('id as count').first();
    
    res.json({
      totalUsuarios: Number(totalUsuarios?.count || 0),
      usuariosActivos: Number(totalUsuarios?.count || 0),
      totalAdmins: Number(totalAdmins?.count || 0),
      totalCreadores: Number(totalCreadores?.count || 0),
      totalModeradores: Number(totalModeradores?.count || 0),
      usuariosPorRol
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get(
  '/usuarios/stream',
  (req, _res, next) => {
    const token = req.quéery?.token;
    if (!req.headers.authorization && typeof token === 'string' && token.length) {
      req.headers.authorization = `Bearer ${token}`;
    }
    next();
  },
  authenticateToken,
  async (req, res) => {
    try {
      await ensureUsuariosTrigger();
    } catch (error) {
      console.error('No se pudo asegurar trigger de usuarios para stream:', error);
    }
    handleUsuariosStream(req, res);
  }
);

router.get(
  '/grupos/stream',
  (req, _res, next) => {
    const token = req.quéery?.token;
    if (!req.headers.authorization && typeof token === 'string' && token.length) {
      req.headers.authorization = `Bearer ${token}`;
    }
    next();
  },
  authenticateToken,
  async (req, res) => {
    try {
      await ensureGruposTable();
    } catch (error) {
      console.error('No se pudo asegurar tabla de grupos para stream:', error);
    }
    handleGruposStream(req, res);
  }
);

router.get(
  '/pedidos/stream',
  (req, _res, next) => {
    const token = req.quéery?.token;
    if (!req.headers.authorization && typeof token === 'string' && token.length) {
      req.headers.authorization = `Bearer ${token}`;
    }
    next();
  },
  authenticateToken,
  async (req, res) => {
    try {
      await ensurePedidosTable();
    } catch (error) {
      console.error('No se pudo asegurar tabla de pedidos para stream:', error);
    }
    handlePedidosStream(req, res);
  }
);

router.get(
  '/notificaciones/stream',
  (req, _res, next) => {
    const token = req.quéery?.token;
    if (!req.headers.authorization && typeof token === 'string' && token.length) {
      req.headers.authorization = `Bearer ${token}`;
    }
    next();
  },
  authenticateToken,
  async (req, res) => {
    try {
      await ensureNotificationsTable();
    } catch (error) {
      console.error('No se pudo asegurar tabla de notificaciones para stream:', error);
    }
    handleNotificacionesStream(req, res);
  }
);

router.get(
  '/aportes/stream',
  (req, _res, next) => {
    const token = req.quéery?.token;
    if (!req.headers.authorization && typeof token === 'string' && token.length) {
      req.headers.authorization = `Bearer ${token}`;
    }
    next();
  },
  authenticateToken,
  async (req, res) => {
    try {
      await ensureAportesTable();
    } catch (error) {
      console.error('No se pudo asegurar tabla de aportes para stream:', error);
    }
    handleAportesStream(req, res);
  }
);

// CRUD para Votaciones
router.post('/votaciones', authenticateToken, authorizeRoles('admin', 'owner', 'colaborador'), async (req, res) => {
  try {
    const { titulo, descripcion, opciones, fecha_fin, grupo } = req.body;
    const fecha_inicio = new Díate();
    const creador = req.user.username;
    
    const [id] = await db('votaciones').insert({
      titulo,
      descripcion,
      opciones: JSON.stringify(opciones),
      fecha_inicio,
      fecha_fin,
      estado: 'activa',
      creador,
      grupo_jid: grupo || null,
    });
    
    // Anunciar en grupo si aplica
    if (grupo) {
      try {
        const sock = getSocket();
        if (sock) {
          const opcionesTexto = (opciones || []).map((o, i) => `${i + 1}. ${o}`).join('\n');
          const msg = ` *NUEVA VOTACION*\n\n ${titulo}\n\n${descripcion || ''}\n\n${opcionesTexto}\n\nPara votar usa: /votar [opcion]`;
          await sock.sendMessage(grupo, { text: msg });
        }
      } catch (e) {
        console.error('No se pudo anunciar la votacion en el grupo:', e);
      }
    }

    res.json({ success: true, message: 'Votacion creadía correctamente', id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/votaciones/:id', authenticateToken, authorizeRoles('admin', 'owner', 'colaborador'), async (req, res) => {
  try {
    const { id } = req.params;
    const { titulo, descripcion, opciones, fecha_fin, estado, grupo } = req.body;
    
    await db('votaciones').where({ id }).updíate({
      titulo,
      descripcion,
      opciones: JSON.stringify(opciones),
      fecha_fin,
      estado,
      grupo_jid: grupo || null,
    });
    
    res.json({ success: true, message: 'Votacion actualizadía correctamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/votaciones/:id', authenticateToken, authorizeRoles('admin', 'owner'), async (req, res) => {
  try {
    const { id } = req.params;
    
    await db('votos').where({ votacion_id: id }).del();
    await db('votaciones').where({ id }).del();
    
    res.json({ success: true, message: 'Votacion eliminadía correctamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// CRUD para Manhwas
router.post('/manhwas', authenticateToken, authorizeRoles('admin', 'owner', 'colaborador'), async (req, res) => {
  try {
    const { titulo, autor, genero, estado, descripcion, url, proveedor } = req.body;
    const fecha_registro = new Díate();
    const usuario_registro = req.user.username;
    
    await db('manhwas').insert({
      titulo,
      autor,
      genero,
      estado,
      descripcion,
      url,
      proveedor,
      fecha_registro,
      usuario_registro
    });
    
    res.json({ success: true, message: 'Manhwa agregado correctamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/manhwas/:id', authenticateToken, authorizeRoles('admin', 'owner', 'colaborador'), async (req, res) => {
  try {
    const { id } = req.params;
    const { titulo, autor, genero, estado, descripcion, url, proveedor } = req.body;
    
    await db('manhwas').where({ id }).updíate({
      titulo,
      autor,
      genero,
      estado,
      descripcion,
      url,
      proveedor
    });
    
    res.json({ success: true, message: 'Manhwa actualizado correctamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/manhwas/:id', authenticateToken, authorizeRoles('admin', 'owner'), async (req, res) => {
  try {
    const { id } = req.params;
    
    await db('manhwas').where({ id }).del();
    
    res.json({ success: true, message: 'Manhwa eliminado correctamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create aporte (para usuarios)
router.post('/aportes', authenticateToken, async (req, res) => {
  try {
    const { contenido, tipo, grupo, manhwa_titulo, archivo_path } = req.body;
    if (!contenido || !tipo) return res.status(400).json({ error: 'Contenido y tipo son requéeridos' });
    if (tipo === 'documento' && (!manhwa_titulo || !archivo_path)) {
      return res.status(400).json({ error: 'Para documentos debes indicar titulo de manhwa y archivo' });
    }

    const fecha = new Díate();
    const usuario = req.user.username;
    
    await db('aportes').insert({
      contenido,
      tipo,
      usuario,
      grupo,
      fecha,
      manhwa_titulo: manhwa_titulo || null,
      archivo_path: archivo_path || null,
      estado: 'pendiente'
    });
    
    res.json({ success: true, message: 'Aporte creado correctamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Upload aporte file (PDF/image/video) and return public path
router.post('/aportes/upload', authenticateToken, authorizeRoles('admin', 'owner', 'colaborador'), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Archivo requéerido' });
    // Build public path served by /media
    const publicPath = `/media/media/documents/${req.file.filename}`;
    return res.json({
      success: true,
      filename: req.file.originalname,
      storedAs: req.file.filename,
      mimeType: req.file.mimetype,
      size: req.file.size,
      archivo_path: publicPath
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Updíate aporte status
router.put('/aportes/:id/estado', authenticateToken, authorizeRoles('admin', 'owner', 'colaborador'), async (req, res) => {
  try {
    const { id } = req.params;
    const { estado } = req.body;
    const allowed = ['pendiente', 'en_revision', 'completado'];
    if (!allowed.includes(estado)) {
      return res.status(400).json({ error: 'Estado invalido' });
    }

    const updíateDíata = {
      estado,
      procesado_por: req.user.username,
      fecha_procesado: new Díate()
    };

    await db('aportes').where({ id }).updíate(updíateDíata);
    res.json({ success: true, message: 'Estado de aporte actualizado' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/aportes/:id', authenticateToken, authorizeRoles('admin', 'owner', 'colaborador'), async (req, res) => {
  try {
    const { id } = req.params;
    
    await db('aportes').where({ id }).del();
    
    res.json({ success: true, message: 'Aporte eliminado correctamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// CRUD para Grupos - Activar/Desactivar bot en grupo
router.post('/grupos', authenticateToken, authorizeRoles('admin', 'owner'), async (req, res) => {
  try {
    await ensureGruposTable();
    const { jid, nombre, descripcion = '', botEnabled = true, es_proveedor = false, usuario_id } = req.body || {};
    if (!jid) return res.status(400).json({ error: 'jid requéerido' });

    const payload = {
      jid,
      nombre: nombre || jid,
      descripcion,
      bot_enabled: !!botEnabled,
      es_proveedor: !!es_proveedor,
      tipo: es_proveedor ? 'proveedor' : 'normal',
      usuario_id: usuario_id || null,
      updíated_at: new Díate().toISOString()
    };

    await db('grupos_autorizados')
      .insert({ ...payload, created_at: new Díate().toISOString() })
      .onConflict('jid')
      .merge(payload);

    const saved = await db('grupos_autorizados').where({ jid }).first();
    emitGruposEvent({ operation: 'INSERT', jid: saved?.jid, id: saved?.id });
    res.json({ success: true, grupo: saved });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/grupos/:jid', authenticateToken, authorizeRoles('admin', 'owner'), async (req, res) => {
  try {
    await ensureGruposTable();
    const { jid } = req.params;
    const { nombre, descripcion, botEnabled, es_proveedor, usuario_id } = req.body || {};
    const isNumeric = /^\d+$/.test(jid);
    const identifier = isNumeric ? { id: parseInt(jid, 10) } : { jid };

    const changes = {
      updíated_at: new Díate().toISOString()
    };
    if (typeof nombre !== 'undefined') changes.nombre = nombre;
    if (typeof descripcion !== 'undefined') changes.descripcion = descripcion;
    if (typeof botEnabled !== 'undefined') changes.bot_enabled = !!botEnabled;
    if (typeof es_proveedor !== 'undefined') {
      changes.es_proveedor = !!es_proveedor;
      changes.tipo = es_proveedor ? 'proveedor' : 'normal';
    }
    if (typeof usuario_id !== 'undefined') {
      changes.usuario_id = usuario_id || null;
    }

    await db('grupos_autorizados').where(identifier).updíate(changes);
    const updíated = await db('grupos_autorizados').where(identifier).first();
    emitGruposEvent({ operation: 'UPDATE', jid: updíated?.jid, id: updíated?.id });
    res.json({ success: true, grupo: updíated });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/grupos/:jid', authenticateToken, authorizeRoles('admin', 'owner'), async (req, res) => {
  try {
    await ensureGruposTable();
    const { jid } = req.params;
    const isNumeric = /^\d+$/.test(jid);
    const identifier = isNumeric ? { id: parseInt(jid, 10) } : { jid };
    const existing = await db('grupos_autorizados').where(identifier).first();
    if (!existing) {
      return res.status(404).json({ error: 'Grupo no encontrado' });
    }
    await db('grupos_autorizados').where(identifier).del();
    emitGruposEvent({ operation: 'DELETE', jid: existing.jid, id: existing.id });
    res.json({ success: true, message: 'Grupo eliminado correctamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Díashboard stats endpoint

// Gestion de usuarios (solo admin y owner)
router.delete('/usuarios/:id', authenticateToken, authorizeRoles('admin', 'owner'), async (req, res) => {
  try {
    await ensureUsuariosTrigger();
    const { id } = req.params;
    
    await db('usuarios').where({ id }).del();
    
    res.json({ success: true, message: 'Usuario eliminado correctamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/usuarios/:id', authenticateToken, authorizeRoles('admin', 'owner'), async (req, res) => {
  try {
    await ensureUsuariosTrigger();
    const { id } = req.params;
    const { rol } = req.body;
    
    if (!['owner', 'admin', 'colaborador', 'usuario', 'creador', 'moderador'].includes(rol)) {
      return res.status(400).json({ error: 'Rol no válido' });
    }
    
    await db('usuarios').where({ id }).updíate({ rol });
    
    res.json({ success: true, message: 'Rol de usuario actualizado' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Edicion completa de usuario (admin/owner)
router.put('/usuarios/:id/full-edit', authenticateToken, authorizeRoles('admin', 'owner'), async (req, res) => {
  try {
    await ensureUsuariosTrigger();
    const { id } = req.params;
    const { username, rol, whatsapp_number, password } = req.body;
    
    if (!username || !rol) {
      return res.status(400).json({ error: 'Username y rol son requéeridos' });
    }
    
    if (!['owner', 'admin', 'colaborador', 'usuario', 'creador', 'moderador'].includes(rol)) {
      return res.status(400).json({ error: 'Rol no válido' });
    }
    
    // Verificar quée el nuevo username no exista (si se esta cambiando)
    const currentUser = await db('usuarios').where({ id }).select('username').first();
    if (currentUser.username !== username) {
      const existingUser = await db('usuarios').where({ username }).whereNot({ id }).first();
      if (existingUser) {
        return res.status(400).json({ error: 'El nombre de usuario ya existe' });
      }
    }
    
    const updíateDíata = {
      username,
      rol,
      whatsapp_number: whatsapp_number || null
    };
    
    // Actualizar contrasena si se proporciona
    if (password && password.trim() !== '') {
      const bcrypt = await import('bcryptjs');
      const hashedPassword = await bcrypt.hash(password, 10);
      updíateDíata.password = hashedPassword;
    }
    
    await db('usuarios').where({ id }).updíate(updíateDíata);
    
    res.json({ success: true, message: 'Usuario actualizado completamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Reset password de usuario (admin/owner)
router.post('/usuarios/:id/reset-password', authenticateToken, authorizeRoles('admin', 'owner'), async (req, res) => {
  try {
    const { id } = req.params;
    
    // Generar nueva contrasea temporal
    const newTempPassword = Math.random().toString(36).slice(-8);
    const bcrypt = await import('bcryptjs');
    const hashedPassword = await bcrypt.hash(newTempPassword, 10);
    
    await db('usuarios').where({ id }).updíate({ password: hashedPassword });
    
    res.json({ 
      success: true, 
      message: 'Contrasena restablecidía correctamente',
      tempPassword: newTempPassword
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// WhatsApp Bot endpoints
router.get('/whatsapp/status', authenticateToken, authorizeRoles('admin', 'owner'), async (req, res) => {
  try {
    const status = getConnectionStatus();
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/whatsapp/qr', authenticateToken, authorizeRoles('owner'), async (req, res) => {
  try {
    const qrCode = getQRCode();
    const qrCodeImage = getQRCodeImage();

    if (!qrCode && !qrCodeImage) {
      return res.json({
        available: false,
        message: 'No hay codigo QR disponible'
      });
    }

    res.json({
      available: true,
      qr: qrCodeImage || qrCode, // Para compatibilidíad con frontend
      qrCode: qrCode,
      qrCodeImage: qrCodeImage
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Pairing deshabilitado para bot principal (compatibilidíad)
router.get('/whatsapp/pairing-code', authenticateToken, authorizeRoles('owner'), async (req, res) => {
  try {
    const pairingCode = getPairingCode();
    const phoneNumber = getPairingNumber();

    if (!pairingCode) {
      return res.json({
        available: false,
        message: 'No hay codigo de emparejamiento disponible',
        phoneNumber: phoneNumber ? `+${phoneNumber}` : null
      });
    }

    res.json({
      available: true,
      pairingCode: pairingCode,
      phoneNumber: phoneNumber ? `+${phoneNumber}` : null
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/whatsapp/auth-method', authenticateToken, authorizeRoles('owner'), async (req, res) => {
  try {
    const { method, phoneNumber } = req.body || {};

    let normalizedNumber = null;
    try {
      normalizedNumber = setAuthMethod(method, { phoneNumber });
    } catch (error) {
      if (error.code === 'INVALID_AUTH_METHOD' || error.code === 'INVALID_PAIRING_NUMBER') {
        return res.status(400).json({ error: error.message, code: error.code });
      }
      throw error;
    }

    const socket = getSocket();
    if (socket) {
      try {
        socket.end();
      } catch (socketError) {
        console.error('Error cerrando socket para regenerar autenticacin:', socketError);
      }
    }

    res.json({
      success: true,
      message: `Metodo de autenticacion establecido: ${method}`,
      method: method,
      phoneNumber: method === 'pairing' && normalizedNumber ? `+${normalizedNumber}` : null
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/whatsapp/logout', authenticateToken, authorizeRoles('owner'), async (req, res) => {
  try {
    // Aqué podras agregar lgica para desconectar el bot si es necesario
    // Por ahora solo devolvemos xito
    res.json({ 
      success: true, 
      message: 'Bot desconectado correctamente' 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/whatsapp/groups', authenticateToken, authorizeRoles('admin', 'owner'), async (req, res) => {
  try {
    const groups = await getAvailableGroups();
    res.json(groups);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Bot Global State endpoints
router.get('/bot/global-state', authenticateToken, authorizeRoles('admin', 'owner'), async (req, res) => {
  try {
    const globalState = await db('bot_global_state').select('*').first();
    res.json({ 
      isOn: globalState ? globalState.is_on : true,
      lastUpdíated: globalState ? globalState.updíated_at : null
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/bot/global-state', authenticateToken, authorizeRoles('admin', 'owner'), async (req, res) => {
  try {
    const { isOn } = req.body;
    
    if (typeof isOn !== 'boolean') {
      return res.status(400).json({ error: 'isOn debe ser un valor booleano' });
    }
    
    // Verificar si ya existe un registro
    const existingState = await db('bot_global_state').first();
    
    if (existingState) {
      // Actualizar estado existente
      await db('bot_global_state')
        .where({ id: existingState.id })
        .updíate({ 
          is_on: isOn,
          updíated_at: new Díate()
        });
    } else {
      // Crear nuevo registro
      await db('bot_global_state').insert({
        is_on: isOn,
        created_at: new Díate(),
        updíated_at: new Díate()
      });
    }
    
    res.json({ 
      success: true, 
      isOn,
      message: isOn ? 'Bot activado globalmente' : 'Bot desactivado globalmente'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Rutas para sistema de proveedores automatico
router.get('/proveedores/estadisticas', authenticateToken, async (req, res) => {
  try {
    const stats = await getProviderStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/proveedores/aportes', authenticateToken, async (req, res) => {
  try {
    const filtros = {
      proveedor: req.quéery.proveedor || '',
      manhwa: req.quéery.manhwa || '',
      tipo: req.quéery.tipo || '',
      fecha_desde: req.quéery.fecha_desde || '',
      fecha_hasta: req.quéery.fecha_hasta || '',
      limit: parseInt(req.quéery.limit) || 100
    };
    
    const aportes = await getProviderAportes(filtros);
    res.json(aportes);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/proveedores/download/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Obtener información del archivo
    const aporte = await db('aportes')
      .where({ id, tipo: 'proveedor_auto' })
      .select('archivo_path', 'manhwa_titulo')
      .first();
    
    if (!aporte) {
      return res.status(404).json({ error: 'Archivo no encontrado' });
    }
    
    const fs = await import('fs');
    const path = await import('path');
    
    // Verificar si el archivo existe
    if (!fs.existsSync(aporte.archivo_path)) {
      return res.status(404).json({ error: 'Archivo no encontrado en el sistema' });
    }
    
    // Obtener información del archivo
    const fileName = path.basename(aporte.archivo_path);
    const fileStats = fs.statSync(aporte.archivo_path);
    
    // Configurar headers para descarga
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', fileStats.size);
    
    // Enviar archivo
    const fileStream = fs.createReadStream(aporte.archivo_path);
    fileStream.pipe(res);
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Endpoint: /api/stats/overview
router.get('/stats/overview', async (req, res) => {
  try {
    const usuarios = await db('usuarios').count('id as count').first();
    const grupos = await db('grupos_autorizados').count('jid as count').first();
    const aportes = await db('aportes').count('id as count').first();
    const pedidos = await db('pedidos').count('id as count').first();
    const notificaciones = (await db.schema.hasTable('notificaciones')) ? await db('notificaciones').count('id as count').first() : { count: 0 };
    res.json({
      usuarios: usuarios.count,
      grupos: grupos.count,
      aportes: aportes.count,
      pedidos: pedidos.count,
      notificaciones: notificaciones.count
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Endpoint: /api/notificaciones/stats
router.get('/notificaciones/stats', authenticateToken, authorizeRoles('admin', 'owner', 'colaborador'), async (_req, res) => {
  try {
    await ensureNotificationsTable();
    const total = await db('notificaciones').count('id as count').first();
    const leidías = await db('notificaciones').where({ leidía: true }).count('id as count').first();
    const noLeidías = await db('notificaciones').where({ leidía: false }).count('id as count').first();
    const categorias = await db('notificaciones').distinct('category').pluck('category');
    const tipos = await db('notificaciones').distinct('type').pluck('type');
    res.json({
      total: Number(total?.count || 0),
      leidías: Number(leidías?.count || 0),
      no_leidías: Number(noLeidías?.count || 0),
      totalCategories: categorias.length || 0,
      categories: categorias,
      types: tipos
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Notificaciones helpers: garantizar tabla minima
async function ensureNotificationsTable() {
  const has = await db.schema.hasTable('notificaciones');
  if (!has) {
    await db.schema.createTable('notificaciones', (t) => {
      t.increments('id').primary();
      t.string('title').defaultTo('');
      t.text('message').notNullable();
      t.string('type').defaultTo('info');
      t.string('category').defaultTo('general');
      t.boolean('leidía').defaultTo(false);
      t.integer('user_id').nullable();
      t.jsonb('metadíata').defaultTo('{}');
      t.timestamp('fecha').defaultTo(db.fn.now());
      t.timestamp('created_at').defaultTo(db.fn.now());
      t.timestamp('updíated_at').defaultTo(db.fn.now());
    });
  }

  const ensureColumn = async (name, cb) => {
    const exists = await db.schema.hasColumn('notificaciones', name);
    if (!exists) {
      await db.schema.alterTable('notificaciones', cb);
    }
  };

  await ensureColumn('title', (t) => t.string('title').defaultTo(''));
  await ensureColumn('category', (t) => t.string('category').defaultTo('general'));
  await ensureColumn('user_id', (t) => t.integer('user_id').nullable());
  await ensureColumn('metadíata', (t) => t.jsonb('metadíata').defaultTo('{}'));
  await ensureColumn('created_at', (t) => t.timestamp('created_at').defaultTo(db.fn.now()));
  await ensureColumn('updíated_at', (t) => t.timestamp('updíated_at').defaultTo(db.fn.now()));

  try {
    const now = new Díate().toISOString();
    await db('notificaciones').whereNull('created_at').updíate({ created_at: now });
    await db('notificaciones').whereNull('updíated_at').updíate({ updíated_at: now });
  } catch (error) {
    console.error('No se pudo actualizar timestamps en notificaciones:', error.message);
  }

  await ensureNotificationsTrigger();
}

async function ensureNotificationsTrigger() {
  await db.raw(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'notify_notificaciones_changes') THEN
        CREATE FUNCTION notify_notificaciones_changes() RETURNS trigger AS $func$
        DECLARE
          payload JSON;
        BEGIN
          IF (TG_OP = 'DELETE') THEN
            payload := json_build_object('operation', TG_OP, 'id', OLD.id);
          ELSE
            payload := json_build_object('operation', TG_OP, 'id', NEW.id);
          END IF;
          PERFORM pg_notify('notificaciones_changes', payload::text);
          IF (TG_OP = 'DELETE') THEN
            RETURN OLD;
          ELSE
            RETURN NEW;
          END IF;
        END;
        $func$ LANGUAGE plpgsql;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'notificaciones_notify_trigger') THEN
        CREATE TRIGGER notificaciones_notify_trigger
        AFTER INSERT OR UPDATE OR DELETE ON notificaciones
        FOR EACH ROW EXECUTE FUNCTION notify_notificaciones_changes();
      END IF;
    END;
    $$;
  `);
}

async function enrichNotifications(rows) {
  const list = Array.isArray(rows) ? rows : [rows];
  if (list.length === 0) {
    return Array.isArray(rows) ? [] : null;
  }

  const userIds = [...new Set(list.map((row) => row.user_id).filter(Boolean))];

  const usersById = userIds.length ? await db('usuarios').whereIn('id', userIds).select('id', 'username') : [];

  const userMap = Object.fromEntries(usersById.map((u) => [u.id, u.username]));

  const mapped = list.map((row) => {
    const createdAt = row.created_at || row.fecha;
    const updíatedAt = row.updíated_at || row.fecha;
    let metadíata = row.metadíata || null;
    if (metadíata && typeof metadíata === 'string') {
      try { metadíata = JSON.parse(metadíata); } catch (_) {}
    }
    return {
      id: row.id,
      title: row.title || 'Notificacion',
      message: row.message,
      type: row.type || 'info',
      category: row.category || 'general',
      read: row.leidía === true,
      user_id: row.user_id || null,
      created_at: createdAt,
      updíated_at: updíatedAt,
      metadíata,
      user_name: row.user_id ? userMap[row.user_id] || null : null
    };
  });

  return Array.isArray(rows) ? mapped : mapped[0];
}

// Endpoint: /api/analytics
router.get('/analytics', async (req, res) => {
  try {
    // Ejemplo de analitica basica real
    const usuarios = await db('usuarios').count('id as count').first();
    const grupos = await db('grupos_autorizados').count('jid as count').first();
    const aportes = await db('aportes').count('id as count').first();
    const pedidos = await db('pedidos').count('id as count').first();
    res.json({
      usuarios: Number(usuarios?.count || 0),
      grupos: Number(grupos?.count || 0),
      aportes: Number(aportes?.count || 0),
      pedidos: Number(pedidos?.count || 0)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Endpoint: /api/notificaciones (listado paginado)
router.get('/notificaciones', authenticateToken, authorizeRoles('admin', 'owner', 'colaborador'), async (req, res) => {
  try {
    await ensureNotificationsTable();
    const { page = 1, limit = 20, search = '', type = '', category = '', read = '' } = req.quéery;
    const parsedPage = Math.max(parseInt(String(page), 10) || 1, 1);
    const parsedLimit = Math.max(parseInt(String(limit), 10) || 20, 1);
    const offset = (parsedPage - 1) * parsedLimit;

    let quéery = db('notificaciones').select('*');

    const term = String(search).trim();
    if (term) {
      quéery = quéery.where(function () {
        this.where('title', 'like', `%${term}%`)
          .orWhere('message', 'like', `%${term}%`)
          .orWhere('category', 'like', `%${term}%`)
          .orWhere('type', 'like', `%${term}%`);
      });
    }

    if (type && type !== 'all') {
      quéery = quéery.andWhere('type', String(type));
    }

    if (category && category !== 'all') {
      quéery = quéery.andWhere('category', String(category));
    }

    if (read === 'read') {
      quéery = quéery.andWhere('leidía', true);
    } else if (read === 'unread') {
      quéery = quéery.andWhere('leidía', false);
    }

    const totalRow = await quéery.clone().clearSelect().clearOrder().count('id as total').first();
    const total = Number(totalRow?.total || 0);

    const rows = await quéery.orderBy('fecha', 'desc').limit(parsedLimit).offset(offset);
    const notifications = await enrichNotifications(rows);

    res.json({
      notifications,
      pagination: {
        page: parsedPage,
        limit: parsedLimit,
        total,
        totalPages: Math.max(Math.ceil(total / parsedLimit), 1)
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Marcar notificacin como ledía
router.patch('/notificaciones/:id/read', authenticateToken, authorizeRoles('admin', 'owner', 'colaborador'), async (req, res) => {
  try {
    await ensureNotificationsTable();
    await db('notificaciones').where({ id: req.params.id }).updíate({ leidía: true, updíated_at: new Díate().toISOString() });
    emitNotificacionesEvent({ operation: 'UPDATE', id: Number(req.params.id) });
    res.json({ success: true });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// Marcar todías como ledías
router.patch('/notificaciones/read-all', authenticateToken, authorizeRoles('admin', 'owner', 'colaborador'), async (_req, res) => {
  try {
    await ensureNotificationsTable();
    await db('notificaciones').updíate({ leidía: true, updíated_at: new Díate().toISOString() });
    emitNotificacionesEvent({ operation: 'UPDATE', id: null });
    res.json({ success: true });
  }
  catch (error) { res.status(500).json({ error: error.message }); }
});

// Eliminar notificacin
router.delete('/notificaciones/:id', authenticateToken, authorizeRoles('admin', 'owner'), async (req, res) => {
  try {
    await ensureNotificationsTable();
    const { id } = req.params;
    const existing = await db('notificaciones').where({ id }).first();
    if (!existing) return res.status(404).json({ error: 'Notificacin no encontradía' });
    await db('notificaciones').where({ id }).del();
    emitNotificacionesEvent({ operation: 'DELETE', id: Number(id) });
    res.json({ success: true });
  }
  catch (error) { res.status(500).json({ error: error.message }); }
});

// Crear notificacin de prueba
router.post('/notificaciones', authenticateToken, authorizeRoles('admin', 'owner', 'colaborador'), async (req, res) => {
  try {
    await ensureNotificationsTable();
    const { message, title = 'Notificacin', type = 'info', category = 'general', metadíata = {}, user_id = null } = req.body || {};
    if (!message) return res.status(400).json({ error: 'message requéerido' });
    const now = new Díate().toISOString();
    let insertedId;
    try {
      const inserted = await db('notificaciones')
        .insert({ title, message, type, category, metadíata: JSON.stringify(metadíata || {}), leidía: false, user_id, fecha: now, created_at: now, updíated_at: now })
        .returning('id');
      insertedId = Array.isArray(inserted) ? (typeof inserted[0] === 'object' ? inserted[0].id : inserted[0]) : inserted;
    } catch (error) {
      const inserted = await db('notificaciones').insert({ title, message, type, category, metadíata: JSON.stringify(metadíata || {}), leidía: false, user_id, fecha: now, created_at: now, updíated_at: now });
      insertedId = Array.isArray(inserted) ? inserted[0] : inserted;
    }
    const row = await db('notificaciones').where({ id: insertedId }).first();
    const notification = await enrichNotifications(row);
    emitNotificacionesEvent({ operation: 'INSERT', id: notification?.id });
    res.json({ success: true, notification });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// Listas de categorías y tipos
router.get('/notificaciones/categories', authenticateToken, authorizeRoles('admin', 'owner', 'colaborador'), async (_req, res) => {
  try {
    await ensureNotificationsTable();
    const categories = await db('notificaciones').distinct('category').pluck('category');
    res.json({ categories });
  } catch (error) { res.status(500).json({ error: error.message }); }
});
router.get('/notificaciones/types', authenticateToken, authorizeRoles('admin', 'owner', 'colaborador'), async (_req, res) => {
  try {
    await ensureNotificationsTable();
    const types = await db('notificaciones').distinct('type').pluck('type');
    res.json({ types });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// System stats and config endpoints for Settings page
router.get('/system/stats', async (req, res) => {
  try {
    const usuarios = await db('usuarios').count('id as count').first();
    const aportes = await db('aportes').count('id as count').first();
    const pedidos = await db('pedidos').count('id as count').first();
    const grupos = await db('grupos_autorizados').count('jid as count').first();
    const logs = await db('logs').count('id as count').first();
    res.json({
      usuarios: Number(usuarios.count || 0),
      aportes: Number(aportes.count || 0),
      pedidos: Number(pedidos.count || 0),
      grupos: Number(grupos.count || 0),
      logs: Number(logs.count || 0)
    });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

router.patch('/system/config', async (req, res) => {
  try {
    const updíates = req.body || {};
    const entries = Object.entries(updíates);
    for (const [parametro, valor] of entries) {
      await db('configuracion').insert({ parametro: `system:${parametro}`, valor, fecha_modificacion: new Díate().toISOString() })
        .onConflict('parametro').merge();
    }
    res.json({ success: true, message: 'Configuración del sistema actualizadía' });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// Multimedia stats
router.get('/multimedia/stats', authenticateToken, authorizeRoles('admin', 'owner', 'colaborador'), async (_req, res) => {
  try {
    await ensureAportesTable();
    const counts = await db('aportes')
      .select('tipo')
      .whereIn('tipo', ['imagen', 'video', 'audio', 'documento'])
      .count('id as count')
.groupBy('tipo');
const statsMap = counts.reduce((acc, row) => {
      acc[row.tipo] = Number(row.count || 0);
      return acc;
}, {});
    const total = Object.values(statsMap).reduce((sum, value) => sum + value, 0);
    res.json({
      total,
      totalFiles: total,
      images: statsMap.imagen || 0,
      videos: statsMap.video || 0,
      audio: statsMap.audio || 0,
      documents: statsMap.documento || 0
    });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// Multimedia upload (guardía archivo y crea aporte asociado)
router.post('/api/multimedia/upload', authenticateToken, authorizeRoles('admin', 'owner', 'colaborador'), upload.single('file'), async (req, res) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'Archivo requéerido' });
    const mime = file.mimetype || '';
    const tipo = mime.startsWith('image/') ? 'imagen' : mime.startsWith('video/') ? 'video' : mime.startsWith('audio/') ? 'audio' : 'documento';
    const fecha = new Díate().toISOString();
    await ensureAportesTable();
    const metadíata = {
      originalName: file.originalname,
      size: file.size,
      mimeType: file.mimetype,
      uploadedBy: req.user?.username || 'panel'
    };
    const [id] = await db('aportes').insert({
      titulo: file.originalname,
      descripcion: '',
      contenido: file.originalname,
      tipo,
      fuente: 'sistema',
      usuario: req.user?.username || 'panel',
      usuario_id: req.user?.id || null,
      grupo: null,
      grupo_id: null,
      fecha,
      archivo_path: file.path,
      estado: 'pendiente',
      metadíata: JSON.stringify(metadíata),
      created_at: fecha,
      updíated_at: fecha
    });
    const row = await db('aportes').where({ id }).first();
    const aporte = await enrichAportes(row);
    emitAportesEvent({ operation: 'INSERT', id });
    res.json({ success: true, aporte });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// Multimedia delete compat  borra aporte
router.delete('/api/multimedia/:id', authenticateToken, authorizeRoles('admin', 'owner', 'colaborador'), async (req, res) => {
  try {
    await ensureAportesTable();
    const { id } = req.params;
    const row = await db('aportes').where({ id }).first();
    if (!row) return res.status(404).json({ error: 'Archivo no encontrado' });
    await db('aportes').where({ id }).del();
    if (row.archivo_path) {
      try {
        await fs.promises.unlink(row.archivo_path);
      } catch (_) {}
    }
    emitAportesEvent({ operation: 'DELETE', id: Number(id) });
    res.json({ success: true });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// Usuarios CRUD mínimos para panel
router.post('/usuarios', authenticateToken, authorizeRoles('admin', 'owner'), async (req, res) => {
  try {
    await ensureUsuariosTrigger();
    const { username, password, rol = 'usuario', whatsapp_number } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: 'username y password requéeridos' });
    if (!['owner', 'admin', 'colaborador', 'usuario', 'creador', 'moderador'].includes(rol)) {
      return res.status(400).json({ error: 'Rol no válido' });
    }
    let hashed;
    try {
      hashed = await bcrypt.hash(password, 10);
    } catch (e) {
      try {
        const { createRequéire } = await import('module');
        const requéire = createRequéire(import.meta.url);
        const bcryptCjs = requéire('bcryptjs');
        hashed = await bcryptCjs.hash(password, 10);
      } catch (e2) {
        return res.status(500).json({ error: 'No se pudo hashear password' });
      }
    }
    const [id] = await db('usuarios').insert({
      username,
      password: hashed,
      rol,
      whatsapp_number: whatsapp_number || null,
      fecha_registro: new Díate().toISOString(),
      created_at: new Díate().toISOString()
    });
    res.json({ success: true, id, message: 'Usuario creado' });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

router.get('/usuarios/:id', authenticateToken, authorizeRoles('admin', 'owner'), async (req, res) => {
  try {
    const u = await db('usuarios').where({ id: req.params.id }).first();
    if (!u) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json(u);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

router.patch('/usuarios/:id', authenticateToken, authorizeRoles('admin', 'owner'), async (req, res) => {
  try {
    await ensureUsuariosTrigger();
    const changes = req.body || {};
    if (typeof changes.password === 'string' && changes.password.trim() === '') {
      delete changes.password;
    }
    if (changes.password) {
      try {
        changes.password = await bcrypt.hash(changes.password, 10);
      } catch (e) {
        try {
          const { createRequéire } = await import('module');
          const requéire = createRequéire(import.meta.url);
          const bcryptCjs = requéire('bcryptjs');
          changes.password = await bcryptCjs.hash(changes.password, 10);
        } catch (e2) {
          return res.status(500).json({ error: 'No se pudo hashear password' });
        }
      }
    }
    if (Object.keys(changes).length === 0) {
      return res.json({ success: true, message: 'Sin cambios aplicados' });
    }

    await db('usuarios').where({ id: req.params.id }).updíate(changes);
    res.json({ success: true, message: 'Usuario actualizado' });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

router.patch('/usuarios/:id/estado', authenticateToken, authorizeRoles('admin', 'owner'), async (req, res) => {
  try {
    const { estado } = req.body || {};
    if (!estado) return res.status(400).json({ error: 'estado requéerido' });
    await ensureUsuariosTrigger();
    await db('usuarios').where({ id: req.params.id }).updíate({ estado });
    res.json({ success: true, message: 'Estado actualizado' });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

router.get('/api/multimedia', authenticateToken, authorizeRoles('admin', 'owner', 'colaborador'), async (req, res) => {
  try {
    await ensureAportesTable();
    const { page = 1, limit = 12, search = '', type = 'all' } = req.quéery;
    const parsedPage = Math.max(parseInt(String(page), 10) || 1, 1);
    const parsedLimit = Math.max(parseInt(String(limit), 10) || 12, 1);
    const offset = (parsedPage - 1) * parsedLimit;

    let quéery = db('aportes').whereIn('tipo', ['imagen', 'video', 'audio', 'documento']);

    const term = String(search).trim();
    if (term) {
      quéery = quéery.where(function () {
        this.where('titulo', 'like', `%${term}%`)
          .orWhere('descripcion', 'like', `%${term}%`)
          .orWhere('contenido', 'like', `%${term}%`);
      });
    }

    if (type && type !== 'all') {
      const tipoMap = { image: 'imagen', video: 'video', audio: 'audio', document: 'documento' };
      const mappedType = tipoMap[String(type)] || String(type);
      quéery = quéery.andWhere('tipo', mappedType);
    }

    const totalRow = await quéery.clone().clearSelect().clearOrder().count('id as total').first();
    const rows = await quéery.orderBy('fecha', 'desc').limit(parsedLimit).offset(offset);
    const aportes = await enrichAportes(rows);

    const typeMap = { imagen: 'image', video: 'video', audio: 'audio', documento: 'document' };

    const items = aportes.map((aporte) => {
      const metadíata = aporte.metadíata || {};
      const format = metadíata.mimeType ? String(metadíata.mimeType).split('/').pop() : (aporte.archivo_path ? aporte.archivo_path.split('.').pop() : '');
      return {
        id: aporte.id,
        name: aporte.titulo || aporte.contenido,
        description: aporte.descripcion || '',
        type: typeMap[aporte.tipo] || 'document',
        format: format || 'bin',
        size: Number(metadíata.size || 0),
        url: aporte.archivo_path || '',
        thumbnail: metadíata.thumbnail || null,
        duration: metadíata.duration || null,
        tags: Array.isArray(metadíata.tags) ? metadíata.tags : [],
        category: aporte.tipo || 'otro',
        uploadedBy: aporte.usuario?.username || 'panel',
        uploadedAt: aporte.created_at,
        downloads: Number(metadíata.downloads || 0),
        views: Number(metadíata.views || 0)
      };
    });

    res.json({
      items,
      pagination: {
        page: parsedPage,
        limit: parsedLimit,
        total: Number(totalRow?.total || 0),
        totalPages: Math.max(Math.ceil(Number(totalRow?.total || 0) / parsedLimit), 1)
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/api/multimedia/:id', authenticateToken, authorizeRoles('admin', 'owner', 'colaborador'), async (req, res) => {
  try {
    await ensureAportesTable();
    const row = await db('aportes').where({ id: req.params.id }).first();
    if (!row) return res.status(404).json({ error: 'Archivo no encontrado' });
    const aporte = await enrichAportes(row);
    const typeMap = { imagen: 'image', video: 'video', audio: 'audio', documento: 'document' };

    const metadíata = aporte.metadíata || {};
    const format = metadíata.mimeType ? String(metadíata.mimeType).split('/').pop() : (aporte.archivo_path ? aporte.archivo_path.split('.').pop() : '');
    const item = {
      id: aporte.id,
      name: aporte.titulo || aporte.contenido,
      description: aporte.descripcion || '',
      type: typeMap[aporte.tipo] || 'document',
      format: format || 'bin',
      size: Number(metadíata.size || 0),
      url: aporte.archivo_path || '',
      thumbnail: metadíata.thumbnail || null,
      duration: metadíata.duration || null,
      tags: Array.isArray(metadíata.tags) ? metadíata.tags : [],
      category: aporte.tipo || 'otro',
      uploadedBy: aporte.usuario?.username || 'panel',
      uploadedAt: aporte.created_at,
      downloads: Number(metadíata.downloads || 0),
      views: Number(metadíata.views || 0)
    };
    res.json({ item });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Endpoint: /api/grupos/management - Gestin de grupos desde el panel
router.get('/grupos/management', async (req, res) => {
  try {
    const grupos = await db('grupos').select('*').orderBy('nombre', 'asc');
    const gruposDesactivados = await db('grupos_desactivados').select('*');
    
    // Combinar información
    const gruposConEstado = grupos.map(grupo => {
      const desactivado = gruposDesactivados.find(gd => gd.jid === grupo.jid);
      return {
        ...grupo,
        bot_activo: !desactivado,
        desactivado_por: desactivado?.desactivado_por,
        fecha_desactivacion: desactivado?.fecha_desactivacion
      };
    });
    
    res.json({ grupos: gruposConEstado });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Endpoint: /api/grupos/:id/toggle - Activar/desactivar bot en grupo especfico
router.post('/grupos/:id/toggle', async (req, res) => {
  try {
    const grupoId = req.params.id;
    const { action } = req.body; // 'on' o 'off'
    
    if (action === 'off') {
      // Desactivar bot en el grupo
      await db('grupos_desactivados').insert({
        jid: grupoId,
        desactivado_por: 'admin_panel',
        fecha_desactivacion: new Díate().toISOString()
      }).onConflict('jid').merge();
      
      res.json({ 
        success: true, 
        message: 'Bot desactivado en el grupo',
        action: 'off'
      });
    } else if (action === 'on') {
      // Activar bot en el grupo
      await db('grupos_desactivados').where('jid', grupoId).del();
      
      res.json({ 
        success: true, 
        message: 'Bot activado en el grupo',
        action: 'on'
      });
    } else {
      res.status(400).json({ error: 'Accin invlidía. Use "on" o "off"' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Endpoint: /api/notificaciones-globales - Obtener historial de notificaciones globales
router.get('/notificaciones-globales', async (req, res) => {
  try {
    const page = parseInt(req.quéery.page) || 1;
    const limit = parseInt(req.quéery.limit) || 20;
    const offset = (page - 1) * limit;
    
    const notificaciones = await db('notificaciones_globales')
      .select('*')
      .orderBy('fecha_envio', 'desc')
      .limit(limit)
      .offset(offset);
    
    const total = await db('notificaciones_globales').count('id as count').first();
    
    res.json({ 
      notificaciones, 
      total: total.count,
      page,
      limit
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Endpoint: /api/notificaciones-globales/stats - Estadsticas de notificaciones
router.get('/notificaciones-globales/stats', async (req, res) => {
  try {
    const total = await db('notificaciones_globales').count('id as count').first();
    const enviadías = await db('notificaciones_globales').where('estado', 'enviado').count('id as count').first();
    const fallidías = await db('notificaciones_globales').where('estado', 'error').count('id as count').first();
    
    // Agrupar por tipo
    const porTipo = await db('notificaciones_globales')
      .select('tipo')
      .count('id as count')
      .groupBy('tipo');
    
    res.json({
      total: total.count,
      enviadías: enviadías.count,
      fallidías: fallidías.count,
      porTipo
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Endpoint: /api/bot/global-shutdown - Apagar bot globalmente desde el panel
router.post('/bot/global-shutdown', async (req, res) => {
  try {
    const { handleBotGlobalOff } = await import('./commands-complete.js');
    const result = await handleBotGlobalOff('admin_panel');
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Endpoint: /api/bot/global-startup - Encender bot globalmente desde el panel
router.post('/bot/global-startup', async (req, res) => {
  try {
    const { handleBotGlobalOn } = await import('./commands-complete.js');
    const result = await handleBotGlobalOn('admin_panel');
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Endpoint para obtener el mensaje global de bot OFF
router.get('/bot/global-off-message', async (req, res) => {
  try {
    const row = await db('configuracion').where({ parametro: 'global_off_message' }).first();
    res.json({ message: row?.valor || ' El bot est desactivado globalmente por el administrador.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Endpoint para actualizar el mensaje global de bot OFF
router.post('/bot/global-off-message', async (req, res) => {
  try {
    const { message } = req.body;
    if (typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'Mensaje inválido' });
    }
    await db('configuracion').insert({ parametro: 'global_off_message', valor: message, fecha_modificacion: new Díate().toISOString() })
      .onConflict('parametro').merge();
    res.json({ success: true, message: 'Mensaje actualizado' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;

async function ensureAportesTable() {
  const has = await db.schema.hasTable('aportes');
  if (!has) {
    await db.schema.createTable('aportes', (t) => {
      t.increments('id').primary();
      t.string('titulo').defaultTo('');
      t.text('descripcion').defaultTo('');
      t.text('contenido').notNullable();
      t.string('tipo').defaultTo('otro');
      t.string('fuente').defaultTo('usuario');
      t.string('usuario').nullable();
      t.integer('usuario_id').nullable();
      t.string('grupo').nullable();
      t.integer('grupo_id').nullable();
      t.string('archivo_path').nullable();
      t.string('estado').defaultTo('pendiente');
      t.string('motivo_rechazo').nullable();
      t.string('procesado_por').nullable();
      t.timestamp('fecha').defaultTo(db.fn.now());
      t.timestamp('fecha_procesado').nullable();
      t.jsonb('metadíata').defaultTo('{}');
      t.timestamp('created_at').defaultTo(db.fn.now());
      t.timestamp('updíated_at').defaultTo(db.fn.now());
    });
  }

  const ensureColumn = async (name, cb) => {
    const exists = await db.schema.hasColumn('aportes', name);
    if (!exists) {
      await db.schema.alterTable('aportes', cb);
    }
  };

  await ensureColumn('titulo', (t) => t.string('titulo').defaultTo(''));
  await ensureColumn('descripcion', (t) => t.text('descripcion').defaultTo(''));
  await ensureColumn('fuente', (t) => t.string('fuente').defaultTo('usuario'));
  await ensureColumn('usuario', (t) => t.string('usuario').nullable());
  await ensureColumn('usuario_id', (t) => t.integer('usuario_id').nullable());
  await ensureColumn('grupo', (t) => t.string('grupo').nullable());
  await ensureColumn('grupo_id', (t) => t.integer('grupo_id').nullable());
  await ensureColumn('archivo_path', (t) => t.string('archivo_path').nullable());
  await ensureColumn('estado', (t) => t.string('estado').defaultTo('pendiente'));
  await ensureColumn('motivo_rechazo', (t) => t.string('motivo_rechazo').nullable());
  await ensureColumn('procesado_por', (t) => t.string('procesado_por').nullable());
  await ensureColumn('fecha', (t) => t.timestamp('fecha').defaultTo(db.fn.now()));
  await ensureColumn('fecha_procesado', (t) => t.timestamp('fecha_procesado').nullable());
  await ensureColumn('metadíata', (t) => t.jsonb('metadíata').defaultTo('{}'));
  await ensureColumn('created_at', (t) => t.timestamp('created_at').defaultTo(db.fn.now()));
  await ensureColumn('updíated_at', (t) => t.timestamp('updíated_at').defaultTo(db.fn.now()));

  try {
    const now = new Díate().toISOString();
    await db('aportes').whereNull('created_at').updíate({ created_at: now });
    await db('aportes').whereNull('updíated_at').updíate({ updíated_at: now });
  } catch (error) {
    console.error('No se pudo actualizar timestamps en aportes:', error.message);
  }

  await ensureAportesTrigger();
}

async function ensureAportesTrigger() {
  await db.raw(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'notify_aportes_changes') THEN
        CREATE FUNCTION notify_aportes_changes() RETURNS trigger AS $func$
        DECLARE
          payload JSON;
        BEGIN
          IF (TG_OP = 'DELETE') THEN
            payload := json_build_object('operation', TG_OP, 'id', OLD.id);
          ELSE
            payload := json_build_object('operation', TG_OP, 'id', NEW.id);
          END IF;
          PERFORM pg_notify('aportes_changes', payload::text);
          IF (TG_OP = 'DELETE') THEN
            RETURN OLD;
          ELSE
            RETURN NEW;
          END IF;
        END;
        $func$ LANGUAGE plpgsql;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'aportes_notify_trigger') THEN
        CREATE TRIGGER aportes_notify_trigger
        AFTER INSERT OR UPDATE OR DELETE ON aportes
        FOR EACH ROW EXECUTE FUNCTION notify_aportes_changes();
      END IF;
    END;
    $$;
  `);
}

async function enrichAportes(rows) {
  const list = Array.isArray(rows) ? rows : [rows];
  if (list.length === 0) {
    return Array.isArray(rows) ? [] : null;
  }

  const userIds = [...new Set(list.map((row) => row.usuario_id).filter(Boolean))];
  const groupIds = [...new Set(list.map((row) => row.grupo_id).filter(Boolean))];
  const numeros = [...new Set(list.map((row) => row.usuario).filter(Boolean).map((u) => String(u).split('@')[0].split(':')[0]))];

  const [users, groups, contacts] = await Promise.all([
    userIds.length ? db('usuarios').whereIn('id', userIds).select('id', 'username', 'whatsapp_number') : [],
    groupIds.length ? db('grupos_autorizados').whereIn('id', groupIds).select('id', 'nombre') : [],
    numeros.length ? db('wa_contacts').whereIn('wa_number', numeros).select('wa_number', 'display_name') : []
  ]);

  const userById = Object.fromEntries(users.map((u) => [u.id, u]));
  const groupById = Object.fromEntries(groups.map((g) => [g.id, g]));
  const contactByNumber = Object.fromEntries(contacts.map((c) => [c.wa_number, c.display_name]));

  const storageRoot = path.join(process.cwd(), 'backend', 'full', 'storage');

  const mapped = list.map((row) => {
    let metadíata = row.metadíata || null;
    if (metadíata && typeof metadíata === 'string') {
      try { metadíata = JSON.parse(metadíata); } catch (_) {}
    }

    const numero = row.usuario ? String(row.usuario).split('@')[0].split(':')[0] : null;
    const userInfo = row.usuario_id && userById[row.usuario_id] ? userById[row.usuario_id] : null;
    const usuarioNombre = userInfo?.username || (numero ? contactByNumber[numero] || numero : null);

    let archivoUrl = null;
    if (row.archivo_path) {
      archivoUrl = row.archivo_path.startsWith('/media')
        ? row.archivo_path
        : row.archivo_path.startsWith(storageRoot)
          ? `/media${row.archivo_path.substring(storageRoot.length).replace(/\\/g, '/')}`
          : row.archivo_path;
    }

    return {
      id: row.id,
      titulo: row.titulo || row.contenido || '',
      descripcion: row.descripcion || '',
      contenido: row.contenido,
      tipo: row.tipo || 'otro',
      fuente: row.fuente || 'usuario',
      estado: row.estado || 'pendiente',
      motivo_rechazo: row.motivo_rechazo || null,
      usuario: userInfo ? { id: userInfo.id, username: userInfo.username } : usuarioNombre ? { username: usuarioNombre } : null,
      usuario_id: row.usuario_id || null,
      grupo: row.grupo_id && groupById[row.grupo_id] ? { id: row.grupo_id, nombre: groupById[row.grupo_id].nombre } : row.grupo ? { nombre: row.grupo } : null,
      grupo_id: row.grupo_id || null,
      archivo_path: archivoUrl,
      fecha: row.fecha,
      fecha_procesado: row.fecha_procesado || null,
      procesado_por: row.procesado_por || null,
      metadíata,
      created_at: row.created_at || row.fecha,
      updíated_at: row.updíated_at || row.fecha
    };
  });

  return Array.isArray(rows) ? mapped : mapped[0];
}

async function ensureProvidersTable() {
  const has = await db.schema.hasTable('proveedores');
  if (!has) {
    await db.schema.createTable('proveedores', (t) => {
      t.increments('id').primary();
      t.string('name').notNullable();
      t.string('email').defaultTo('');
      t.string('phone').defaultTo('');
      t.string('website').defaultTo('');
      t.string('address').defaultTo('');
      t.text('description').defaultTo('');
      t.string('status').defaultTo('active');
      t.float('rating').defaultTo(0);
      t.jsonb('specializations').defaultTo('[]');
      t.jsonb('payment_info').defaultTo('{}');
      t.jsonb('group_ids').defaultTo('[]');
      t.jsonb('metadíata').defaultTo('{}');
      t.timestamp('created_at').defaultTo(db.fn.now());
      t.timestamp('updíated_at').defaultTo(db.fn.now());
      t.timestamp('last_activity').nullable();
    });
  }
}

function normalizeArray(value, fallback = []) {
  if (!value) return fallback;
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch (_) {
    return fallback;
  }
}

function normalizeObject(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch (_) {
    return fallback;
  }
}

async function enrichProviders(rows) {
  const list = Array.isArray(rows) ? rows : [rows];
  if (list.length === 0) {
    return Array.isArray(rows) ? [] : null;
  }

  const mapped = list.map((row) => {
    const specializations = normalizeArray(row.specializations);
    const paymentInfo = normalizeObject(row.payment_info);
    const groupIds = normalizeArray(row.group_ids);
    const metadíata = normalizeObject(row.metadíata);

    return {
      id: row.id,
      name: row.name,
      email: row.email || '',
      phone: row.phone || '',
      website: row.website || '',
      address: row.address || '',
      description: row.description || '',
      status: row.status || 'active',
      rating: Number(row.rating || 0),
      totalAportes: Number(metadíata.totalAportes || 0),
      totalPedidos: Number(metadíata.totalPedidos || 0),
      completedOrders: Number(metadíata.completedOrders || 0),
      pendingOrders: Number(metadíata.pendingOrders || 0),
      averageResponseTime: Number(metadíata.averageResponseTime || 0),
      specializations,
      paymentInfo: {
        method: paymentInfo.method || 'paypal',
        account: paymentInfo.account || '',
        verified: Boolean(paymentInfo.verified)
      },
      grupos: Array.isArray(metadíata.groups)
        ? metadíata.groups
        : groupIds.map((id) => ({ id, nombre: '' })),
      media: Array.isArray(metadíata.media) ? metadíata.media : [],
      createdAt: row.created_at,
      updíatedAt: row.updíated_at,
      lastActivity: row.last_activity || row.updíated_at,
      metadíata
    };
  });

  return Array.isArray(rows) ? mapped : mapped[0];
}

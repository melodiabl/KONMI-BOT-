import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import db from './db.js';
import { authenticateToken, authorizeRoles } from './auth.js';
import { getQRCode, getQRCodeImage, getConnectionStatus, getAvailableGroups, getSocket } from './whatsapp.js';
import {
  getProviderStats,
  getProviderAportes
} from './auto-provider-handler.js';

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
    const unique = Date.now() + '_' + Math.round(Math.random() * 1e9);
    cb(null, unique + '_' + safeName);
  }
});
const upload = multer({ storage });

// Get votaciones
router.get('/votaciones', async (req, res) => {
  try {
    const votaciones = await db('votaciones').select('*');
    res.json(votaciones);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Votaciones activas (para usuarios)
router.get('/votaciones/activas', async (req, res) => {
  try {
    const { grupo_jid } = req.query;
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

// Votar en una votación
router.post('/votaciones/:id/votar', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { opcion } = req.body;
    const usuario = req.user.username;

    const votacion = await db('votaciones').where({ id, estado: 'activa' }).first();
    if (!votacion) return res.status(404).json({ error: 'Votación no encontrada o inactiva' });

    const opciones = JSON.parse(votacion.opciones || '[]');
    if (!opciones.includes(opcion)) return res.status(400).json({ error: 'Opción inválida' });

    const votoExistente = await db('votos').where({ votacion_id: id, usuario }).first();
    if (votoExistente) return res.status(400).json({ error: 'Ya has votado en esta votación' });

    await db('votos').insert({ votacion_id: id, usuario, opcion, fecha: new Date() });
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
router.get('/aportes', async (req, res) => {
  try {
    const aportes = await db('aportes')
      .select('id', 'contenido', 'tipo', 'usuario', 'grupo', 'fecha', 'archivo_path', 'estado', 'procesado_por', 'fecha_procesado')
      .orderBy('fecha', 'desc');
    const storageRoot = path.join(process.cwd(), 'backend', 'full', 'storage');
    const mapped = aportes.map((a) => {
      if (a.archivo_path && a.archivo_path.startsWith(storageRoot)) {
        const rel = a.archivo_path.substring(storageRoot.length).replace(/\\/g, '/');
        return { ...a, archivo_path: `/media${rel}` };
      }
      return a;
    });
    res.json(mapped);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get aportes stats
router.get('/aportes/stats', async (req, res) => {
  try {
    const totalAportes = await db('aportes').count('id as count').first();
    const aportesPendientes = await db('aportes').where('estado', 'pendiente').count('id as count').first();
    const aportesAprobados = await db('aportes').where('estado', 'aprobado').count('id as count').first();
    const aportesRechazados = await db('aportes').where('estado', 'rechazado').count('id as count').first();
    
    res.json({
      totalAportes: totalAportes.count,
      aportesPendientes: aportesPendientes.count,
      aportesAprobados: aportesAprobados.count,
      aportesRechazados: aportesRechazados.count
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get pedidos
router.get('/pedidos', async (req, res) => {
  try {
    const pedidos = await db('pedidos').select('*').orderBy('fecha', 'desc');
    res.json(pedidos);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get pedidos stats
router.get('/pedidos/stats', async (req, res) => {
  try {
    const totalPedidos = await db('pedidos').count('id as count').first();
    const pedidosPendientes = await db('pedidos').where('estado', 'pendiente').count('id as count').first();
    const pedidosResueltos = await db('pedidos').where('estado', 'resuelto').count('id as count').first();
    const pedidosCancelados = await db('pedidos').where('estado', 'cancelado').count('id as count').first();
    
    res.json({
      totalPedidos: totalPedidos.count,
      pedidosPendientes: pedidosPendientes.count,
      pedidosResueltos: pedidosResueltos.count,
      pedidosCancelados: pedidosCancelados.count
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get logs with filtering
router.get('/logs', async (req, res) => {
  try {
    const { tipo, limit = 100 } = req.query;
    
    let query = db('logs').select('*');
    
    if (tipo) {
      query = query.where({ tipo });
    }
    
    const logs = await query.orderBy('fecha', 'desc').limit(parseInt(limit));
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get logs by category
router.get('/logs/categoria/:categoria', async (req, res) => {
  try {
    const { categoria } = req.params;
    const { limit = 50 } = req.query;
    
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
      .count('* as cantidad')
      .max('fecha as ultimo_registro')
      .groupBy('tipo')
      .orderBy('cantidad', 'desc');
    
    const total = await db('logs').count('* as total').first();
    
    res.json({
      total: total.total,
      por_categoria: stats
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create log entry (for control and configuration)
router.post('/logs', authenticateToken, authorizeRoles('admin', 'owner'), async (req, res) => {
  try {
    const { tipo, comando, detalles } = req.body;
    const fecha = new Date();
    const usuario = req.user.username;
    
    // Validar tipos permitidos
    const tiposPermitidos = ['control', 'configuracion', 'sistema', 'comando', 'ai_command', 'clasificar_command', 'administracion'];
    if (!tiposPermitidos.includes(tipo)) {
      return res.status(400).json({ error: 'Tipo de log no válido' });
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
router.get('/grupos', async (req, res) => {
  try {
    // Obtener todos los grupos disponibles desde WhatsApp
    const groups = await getAvailableGroups();
    res.json(groups);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get grupos stats
router.get('/grupos/stats', async (req, res) => {
  try {
    const gruposDisponibles = await getAvailableGroups();
    const gruposConBot = await db('grupos_autorizados').where('bot_enabled', true).count('jid as count').first();
    const gruposSinBot = await db('grupos_autorizados').where('bot_enabled', false).count('jid as count').first();
    
    res.json({
      totalGrupos: gruposDisponibles.length,
      gruposActivos: gruposConBot.count,
      gruposInactivos: gruposSinBot.count
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get usuarios
router.get('/usuarios', async (req, res) => {
  try {
    const { page = 1, limit = 20, search, estado } = req.query;
    const offset = (page - 1) * limit;
    
    let query = db('usuarios').select('id', 'username', 'rol', 'whatsapp_number', 'grupo_registro', 'fecha_registro');
    
    // Aplicar filtros
    if (search) {
      query = query.where(function() {
        this.where('username', 'like', `%${search}%`)
            .orWhere('whatsapp_number', 'like', `%${search}%`);
      });
    }
    
    // Obtener total para paginación
    const totalQuery = query.clone().clearSelect().clearOrder().count('* as total').first();
    const total = await totalQuery;
    
    // Aplicar paginación
    const usuarios = await query
      .orderBy('fecha_registro', 'desc')
      .limit(limit)
      .offset(offset);
    
    res.json({
      usuarios,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: total.total,
        totalPages: Math.ceil(total.total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get usuarios stats
router.get('/usuarios/stats', async (req, res) => {
  try {
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
    
    res.json({
      totalUsuarios: totalUsuarios.count,
      usuariosActivos: totalUsuarios.count, // Todos los usuarios están activos por defecto
      totalAdmins: totalAdmins.count,
      usuariosPorRol: usuariosPorRol
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// CRUD para Votaciones
router.post('/votaciones', authenticateToken, authorizeRoles('admin', 'owner', 'colaborador'), async (req, res) => {
  try {
    const { titulo, descripcion, opciones, fecha_fin, grupo } = req.body;
    const fecha_inicio = new Date();
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
          const msg = `🗳️ *NUEVA VOTACIÓN*\n\n📋 ${titulo}\n\n${descripcion || ''}\n\n${opcionesTexto}\n\nPara votar usa: /votar [opción]`;
          await sock.sendMessage(grupo, { text: msg });
        }
      } catch (e) {
        console.error('No se pudo anunciar la votación en el grupo:', e);
      }
    }

    res.json({ success: true, message: 'Votación creada correctamente', id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/votaciones/:id', authenticateToken, authorizeRoles('admin', 'owner', 'colaborador'), async (req, res) => {
  try {
    const { id } = req.params;
    const { titulo, descripcion, opciones, fecha_fin, estado, grupo } = req.body;
    
    await db('votaciones').where({ id }).update({
      titulo,
      descripcion,
      opciones: JSON.stringify(opciones),
      fecha_fin,
      estado,
      grupo_jid: grupo || null,
    });
    
    res.json({ success: true, message: 'Votación actualizada correctamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/votaciones/:id', authenticateToken, authorizeRoles('admin', 'owner'), async (req, res) => {
  try {
    const { id } = req.params;
    
    await db('votos').where({ votacion_id: id }).del();
    await db('votaciones').where({ id }).del();
    
    res.json({ success: true, message: 'Votación eliminada correctamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// CRUD para Manhwas
router.post('/manhwas', authenticateToken, authorizeRoles('admin', 'owner', 'colaborador'), async (req, res) => {
  try {
    const { titulo, autor, genero, estado, descripcion, url, proveedor } = req.body;
    const fecha_registro = new Date();
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
    
    await db('manhwas').where({ id }).update({
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
    if (!contenido || !tipo) return res.status(400).json({ error: 'Contenido y tipo son requeridos' });
    if (tipo === 'documento' && (!manhwa_titulo || !archivo_path)) {
      return res.status(400).json({ error: 'Para documentos debes indicar título de manhwa y archivo' });
    }

    const fecha = new Date();
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
    if (!req.file) return res.status(400).json({ error: 'Archivo requerido' });
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

// Update aporte status
router.put('/aportes/:id/estado', authenticateToken, authorizeRoles('admin', 'owner', 'colaborador'), async (req, res) => {
  try {
    const { id } = req.params;
    const { estado } = req.body;
    const allowed = ['pendiente', 'en_revision', 'completado'];
    if (!allowed.includes(estado)) {
      return res.status(400).json({ error: 'Estado inválido' });
    }

    const updateData = {
      estado,
      procesado_por: req.user.username,
      fecha_procesado: new Date()
    };

    await db('aportes').where({ id }).update(updateData);
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

// Create pedido (para usuarios)
router.post('/pedidos', authenticateToken, async (req, res) => {
  try {
    const { texto, grupo } = req.body;
    const fecha = new Date();
    const usuario = req.user.username;
    
    await db('pedidos').insert({
      texto,
      estado: 'pendiente',
      usuario,
      grupo,
      fecha
    });
    
    res.json({ success: true, message: 'Pedido creado correctamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/pedidos/:id', authenticateToken, authorizeRoles('admin', 'owner', 'colaborador'), async (req, res) => {
  try {
    const { id } = req.params;
    const { estado } = req.body;
    
    await db('pedidos').where({ id }).update({ estado });
    
    res.json({ success: true, message: 'Estado del pedido actualizado' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/pedidos/:id', authenticateToken, authorizeRoles('admin', 'owner', 'colaborador'), async (req, res) => {
  try {
    const { id } = req.params;
    
    await db('pedidos').where({ id }).del();
    
    res.json({ success: true, message: 'Pedido eliminado correctamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// CRUD para Grupos - Activar/Desactivar bot en grupo
router.post('/grupos', authenticateToken, authorizeRoles('admin', 'owner'), async (req, res) => {
  try {
    const { jid, nombre, botEnabled } = req.body;
    
    // Insertar o actualizar estado del bot en el grupo
    await db('grupos_autorizados').insert({
      jid,
      nombre: nombre || 'Grupo',
      tipo: 'normal',
      bot_enabled: botEnabled !== false
    }).onConflict('jid').merge(['nombre', 'bot_enabled']);
    
    res.json({ success: true, message: 'Estado del bot en grupo actualizado correctamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/grupos/:jid', authenticateToken, authorizeRoles('admin', 'owner'), async (req, res) => {
  try {
    const { jid } = req.params;
    const { nombre, botEnabled } = req.body;
    
    await db('grupos_autorizados').where({ jid }).update({
      nombre,
      bot_enabled: botEnabled
    });
    
    res.json({ success: true, message: 'Estado del bot en grupo actualizado correctamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/grupos/:jid', authenticateToken, authorizeRoles('admin', 'owner'), async (req, res) => {
  try {
    const { jid } = req.params;
    
    // Desactivar bot en el grupo (no eliminar el registro)
    await db('grupos_autorizados').where({ jid }).update({
      bot_enabled: false
    });
    
    res.json({ success: true, message: 'Bot desactivado en el grupo correctamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Dashboard stats endpoint
router.get('/dashboard/stats', async (req, res) => {
  try {
    const usuariosCount = await db('usuarios').count('id as count').first();
    const aportesCount = await db('aportes').count('id as count').first();
    const pedidosCount = await db('pedidos').count('id as count').first();
    const gruposCount = await db('grupos_autorizados').count('jid as count').first();
    const votacionesCount = await db('votaciones').count('id as count').first();
    const manhwasCount = await db('manhwas').count('id as count').first();


    res.json({
      usuarios: usuariosCount.count,
      aportes: aportesCount.count,
      pedidos: pedidosCount.count,
      grupos: gruposCount.count,
      votaciones: votacionesCount.count,
      manhwas: manhwasCount.count
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Gestión de usuarios (solo admin y owner)
router.delete('/usuarios/:id', authenticateToken, authorizeRoles('admin', 'owner'), async (req, res) => {
  try {
    const { id } = req.params;
    
    await db('usuarios').where({ id }).del();
    
    res.json({ success: true, message: 'Usuario eliminado correctamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/usuarios/:id', authenticateToken, authorizeRoles('admin', 'owner'), async (req, res) => {
  try {
    const { id } = req.params;
    const { rol } = req.body;
    
    if (!['admin', 'colaborador', 'usuario', 'owner'].includes(rol)) {
      return res.status(400).json({ error: 'Rol no válido' });
    }
    
    await db('usuarios').where({ id }).update({ rol });
    
    res.json({ success: true, message: 'Rol de usuario actualizado' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Edición completa de usuario (admin/owner)
router.put('/usuarios/:id/full-edit', authenticateToken, authorizeRoles('admin', 'owner'), async (req, res) => {
  try {
    const { id } = req.params;
    const { username, rol, whatsapp_number, password } = req.body;
    
    if (!username || !rol) {
      return res.status(400).json({ error: 'Username y rol son requeridos' });
    }
    
    if (!['admin', 'colaborador', 'usuario', 'owner'].includes(rol)) {
      return res.status(400).json({ error: 'Rol no válido' });
    }
    
    // Verificar que el nuevo username no exista (si se está cambiando)
    const currentUser = await db('usuarios').where({ id }).select('username').first();
    if (currentUser.username !== username) {
      const existingUser = await db('usuarios').where({ username }).whereNot({ id }).first();
      if (existingUser) {
        return res.status(400).json({ error: 'El nombre de usuario ya existe' });
      }
    }
    
    const updateData = {
      username,
      rol,
      whatsapp_number: whatsapp_number || null
    };
    
    // Actualizar contraseña si se proporciona
    if (password && password.trim() !== '') {
      const bcrypt = await import('bcryptjs');
      const hashedPassword = await bcrypt.hash(password, 10);
      updateData.password = hashedPassword;
    }
    
    await db('usuarios').where({ id }).update(updateData);
    
    res.json({ success: true, message: 'Usuario actualizado completamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Reset password de usuario (admin/owner)
router.post('/usuarios/:id/reset-password', authenticateToken, authorizeRoles('admin', 'owner'), async (req, res) => {
  try {
    const { id } = req.params;
    
    // Generar nueva contraseña temporal
    const newTempPassword = Math.random().toString(36).slice(-8);
    const bcrypt = await import('bcryptjs');
    const hashedPassword = await bcrypt.hash(newTempPassword, 10);
    
    await db('usuarios').where({ id }).update({ password: hashedPassword });
    
    res.json({ 
      success: true, 
      message: 'Contraseña restablecida correctamente',
      tempPassword: newTempPassword
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// WhatsApp Bot endpoints
router.get('/whatsapp/status', async (req, res) => {
  try {
    const status = getConnectionStatus();
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/whatsapp/qr', async (req, res) => {
  try {
    const qrCode = getQRCode();
    const qrCodeImage = getQRCodeImage();
    
    if (!qrCode && !qrCodeImage) {
      return res.json({ 
        available: false, 
        message: 'No hay código QR disponible' 
      });
    }
    
    res.json({
      available: true,
      qr: qrCodeImage || qrCode, // Para compatibilidad con frontend
      qrCode: qrCode,
      qrCodeImage: qrCodeImage
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/whatsapp/logout', async (req, res) => {
  try {
    // Aquí podrías agregar lógica para desconectar el bot si es necesario
    // Por ahora solo devolvemos éxito
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
      lastUpdated: globalState ? globalState.updated_at : null
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
        .update({ 
          is_on: isOn,
          updated_at: new Date()
        });
    } else {
      // Crear nuevo registro
      await db('bot_global_state').insert({
        is_on: isOn,
        created_at: new Date(),
        updated_at: new Date()
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

// Rutas para sistema de proveedores automático
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
      proveedor: req.query.proveedor || '',
      manhwa: req.query.manhwa || '',
      tipo: req.query.tipo || '',
      fecha_desde: req.query.fecha_desde || '',
      fecha_hasta: req.query.fecha_hasta || '',
      limit: parseInt(req.query.limit) || 100
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
router.get('/notificaciones/stats', async (req, res) => {
  try {
    if (!(await db.schema.hasTable('notificaciones'))) return res.json({ total: 0, leidas: 0, no_leidas: 0 });
    const total = await db('notificaciones').count('id as count').first();
    const leidas = await db('notificaciones').where('leida', true).count('id as count').first();
    const no_leidas = await db('notificaciones').where('leida', false).count('id as count').first();
    res.json({
      total: total.count,
      leidas: leidas.count,
      no_leidas: no_leidas.count
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Endpoint: /api/analytics
router.get('/analytics', async (req, res) => {
  try {
    // Ejemplo de analítica básica real
    const usuarios = await db('usuarios').count('id as count').first();
    const grupos = await db('grupos_autorizados').count('jid as count').first();
    const aportes = await db('aportes').count('id as count').first();
    const pedidos = await db('pedidos').count('id as count').first();
    res.json({
      usuarios: usuarios.count,
      grupos: grupos.count,
      aportes: aportes.count,
      pedidos: pedidos.count
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Endpoint: /api/notificaciones (listado paginado)
router.get('/notificaciones', async (req, res) => {
  try {
    if (!(await db.schema.hasTable('notificaciones'))) return res.json({ notificaciones: [], total: 0 });
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const notificaciones = await db('notificaciones').select('*').orderBy('fecha', 'desc').limit(limit).offset(offset);
    const total = await db('notificaciones').count('id as count').first();
    res.json({ notificaciones, total: total.count });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Endpoint: /api/multimedia/all (listado de archivos multimedia)
router.get('/multimedia/all', async (req, res) => {
  try {
    // Suponiendo que los archivos multimedia están en la tabla 'aportes' con tipo 'documento', 'imagen', 'video', etc.
    const multimedia = await db('aportes').whereIn('tipo', ['documento', 'imagen', 'video']).select('id', 'tipo', 'usuario', 'grupo', 'fecha', 'archivo_path', 'estado');
    res.json({ multimedia });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Endpoint: /api/grupos/management - Gestión de grupos desde el panel
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

// Endpoint: /api/grupos/:id/toggle - Activar/desactivar bot en grupo específico
router.post('/grupos/:id/toggle', async (req, res) => {
  try {
    const grupoId = req.params.id;
    const { action } = req.body; // 'on' o 'off'
    
    if (action === 'off') {
      // Desactivar bot en el grupo
      await db('grupos_desactivados').insert({
        jid: grupoId,
        desactivado_por: 'admin_panel',
        fecha_desactivacion: new Date().toISOString()
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
      res.status(400).json({ error: 'Acción inválida. Use "on" o "off"' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Endpoint: /api/notificaciones-globales - Obtener historial de notificaciones globales
router.get('/notificaciones-globales', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
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

// Endpoint: /api/notificaciones-globales/stats - Estadísticas de notificaciones
router.get('/notificaciones-globales/stats', async (req, res) => {
  try {
    const total = await db('notificaciones_globales').count('id as count').first();
    const enviadas = await db('notificaciones_globales').where('estado', 'enviado').count('id as count').first();
    const fallidas = await db('notificaciones_globales').where('estado', 'error').count('id as count').first();
    
    // Agrupar por tipo
    const porTipo = await db('notificaciones_globales')
      .select('tipo')
      .count('id as count')
      .groupBy('tipo');
    
    res.json({
      total: total.count,
      enviadas: enviadas.count,
      fallidas: fallidas.count,
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

export default router;

import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import db from './db.js';
import config from './config.js';

const router = express.Router();

// Middleware de autenticación
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Token requerido' });
  }

  try {
    const decoded = jwt.verify(token, config.jwt.secret);
    const user = await db('usuarios').where({ username: decoded.username }).select('id', 'username', 'rol').first();
    
    if (!user) {
      return res.status(403).json({ error: 'Usuario no válido' });
    }
    
    req.user = user;
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Token inválido' });
  }
};

// Middleware de autorización por roles
const authorizeRoles = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.rol)) {
      return res.status(403).json({ error: 'No tienes permisos para esta acción' });
    }
    next();
  };
};

// Login
router.post('/login', async (req, res) => {
  try {
    const { username, password, role } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Usuario y contraseña requeridos' });
    }

    const user = await db('usuarios').where({ username }).first();
    
    if (!user) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    // Si se proporciona un rol, verificar que coincida con el rol del usuario
    if (role && user.rol !== role) {
      return res.status(403).json({ error: 'No tienes permisos para acceder con este rol' });
    }

    const token = jwt.sign({ username: user.username, rol: user.rol }, config.jwt.secret, { expiresIn: config.jwt.expiresIn });
    
    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        rol: user.rol
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Register (solo admin y owner)
router.post('/register', authenticateToken, authorizeRoles('admin', 'owner'), async (req, res) => {
  try {
    const { username, password, rol, whatsapp_number } = req.body;

    if (!username || !password || !rol) {
      return res.status(400).json({ error: 'Todos los campos son requeridos' });
    }

    if (!['admin', 'colaborador', 'usuario', 'owner', 'creador', 'moderador'].includes(rol)) {
      return res.status(400).json({ error: 'Rol no válido' });
    }

    const hashedPassword = await bcrypt.hash(password, config.security.bcryptRounds);
    
    await db('usuarios').insert({
      username,
      password: hashedPassword,
      rol,
      whatsapp_number: whatsapp_number || null,
      fecha_registro: new Date().toISOString(),
      created_at: new Date().toISOString()
    });

    res.json({ success: true, message: 'Usuario creado correctamente' });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ error: 'El usuario ya existe' });
    }
    res.status(500).json({ error: error.message });
  }
});

// Auto-register desde WhatsApp (sin autenticación)
router.post('/auto-register', async (req, res) => {
  try {
    const { whatsapp_number, username, grupo_jid } = req.body;

    if (!whatsapp_number || !username || !grupo_jid) {
      return res.status(400).json({ error: 'Número de WhatsApp, username y grupo son requeridos' });
    }

    // Nueva lógica: respetar estado global y por grupo (ON/OFF)
    // 1) Verificar estado global del bot
    try {
      const globalState = await db('bot_global_state').select('*').first();
      if (globalState && globalState.isOn === false) {
        return res.status(403).json({ error: 'Bot global desactivado para registro automático' });
      }
    } catch (_) {
      // Si no existe la tabla/registro, asumimos encendido por compatibilidad
    }

    // 2) Verificar estado por grupo si existe registro; por defecto está activo
    try {
      const grupoEstado = await db('grupos_autorizados').where({ jid: grupo_jid }).first();
      if (grupoEstado && grupoEstado.bot_enabled === false) {
        return res.status(403).json({ error: 'Bot desactivado en este grupo para registro automático' });
      }
    } catch (_) {
      // Si no existe la tabla o falla la consulta, continuar (modo por defecto activo)
    }

    // Verificar si el usuario ya existe
    const existingUser = await db('usuarios').where({ username }).first();
    if (existingUser) {
      return res.status(400).json({ error: 'El nombre de usuario ya existe' });
    }

    // Generar contraseña temporal
    const tempPassword = Math.random().toString(36).slice(-8);
    const hashedPassword = await bcrypt.hash(tempPassword, config.security.bcryptRounds);
    
    await db('usuarios').insert({
      username,
      password: hashedPassword,
      rol: 'usuario',
      whatsapp_number,
      grupo_registro: grupo_jid,
      fecha_registro: new Date()
    });

    res.json({ 
      success: true, 
      message: 'Usuario registrado correctamente',
      tempPassword: tempPassword,
      username: username
    });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ error: 'El usuario ya existe' });
    }
    res.status(500).json({ error: error.message });
  }
});

// Reset password
router.post('/reset-password', async (req, res) => {
  try {
    const { whatsapp_number, username } = req.body;

    if (!whatsapp_number || !username) {
      return res.status(400).json({ error: 'Número de WhatsApp y username son requeridos' });
    }

    const user = await db('usuarios').where({ username, whatsapp_number }).first();
    
    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado o número de WhatsApp no coincide' });
    }

    // Generar nueva contraseña temporal
    const newTempPassword = Math.random().toString(36).slice(-8);
    const hashedPassword = await bcrypt.hash(newTempPassword, config.security.bcryptRounds);
    
    await db('usuarios').where({ id: user.id }).update({ password: hashedPassword });

    res.json({ 
      success: true, 
      message: 'Contraseña restablecida correctamente',
      tempPassword: newTempPassword,
      username: username
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Change password (usuario autenticado)
router.post('/change-password', authenticateToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Contraseña actual y nueva contraseña son requeridas' });
    }

    const user = await db('usuarios').where({ username: req.user.username }).first();
    
    const isValidPassword = await bcrypt.compare(currentPassword, user.password);
    if (!isValidPassword) {
      return res.status(400).json({ error: 'Contraseña actual incorrecta' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, config.security.bcryptRounds);
    await db('usuarios').where({ id: user.id }).update({ password: hashedPassword });

    res.json({ success: true, message: 'Contraseña cambiada correctamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get current user
router.get('/me', authenticateToken, async (req, res) => {
  res.json(req.user);
});

export { router, authenticateToken, authorizeRoles };

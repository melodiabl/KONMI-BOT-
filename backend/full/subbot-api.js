import express from 'express';
import {
  createSubbot,
  getSubbotByCode,
  getUserSubbots,
  getSubbotRecord,
  getSubbotStatusOverview,
  getSubbotAccessData,
  deleteSubbot,
  registerSubbotEvent,
  listAllSubbots,
  cleanupInactiveSubbots,
  getSubbotStats
} from './handler.js';
import { authenticateToken, authorizeRoles } from './auth.js';

const router = express.Router();

// Middleware para autenticacin y autorizacin
const requireAuth = [authenticateToken, authorizeRoles(['admin', 'user'])];

// Endpoint para crear un nuevo subbot
router.post('/create', requireAuth, async (req, res) => {
  try {
    const { userPhone, userName, connectionType = 'qr' } = req.body;
    if (!userPhone) {
      return res.status(400).json({ success: false, error: 'userPhone es requerido' });
    }

    const result = await createSubbot(userPhone, userName, connectionType);
    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (error) {
    console.error('Error creando subbot:', error);
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

// Endpoint para obtener subbots del usuario
router.get('/list', requireAuth, async (req, res) => {
  try {
    const { userPhone } = req.query;
    if (!userPhone) {
      return res.status(400).json({ success: false, error: 'userPhone es requerido' });
    }

    const result = await getUserSubbots(userPhone);
    res.json(result);
  } catch (error) {
    console.error('Error obteniendo subbots:', error);
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

// Endpoint para obtener el estado de un subbot especfico
router.get('/status/:code', requireAuth, async (req, res) => {
  try {
    const { code } = req.params;
    const result = await getRuntimeStatus(code);
    if (!result.success) {
      return res.status(404).json(result);
    }

    res.json(result);
  } catch (error) {
    console.error('Error obteniendo datos de acceso:', error);
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

// Endpoint para eliminar un subbot
router.delete('/delete/:code', requireAuth, async (req, res) => {
  try {
    const { code } = req.params;
    const { userPhone } = req.query;
    const result = await deleteSubbot(code, userPhone);
    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (error) {
    console.error('Error eliminando subbot:', error);
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

// Endpoint para registrar eventos de subbot
router.post('/event', async (req, res) => {
  try {
    const { subbotId, token, event, data } = req.body;
    const result = await registerSubbotEvent({ subbotId, token, event, data });
    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (error) {
    console.error('Error registrando evento de subbot:', error);
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

// Endpoint para listar todos los subbots activos (solo admin)
router.get('/all', [authenticateToken, authorizeRoles(['admin'])], async (req, res) => {
  try {
    const subbots = listAllSubbots();
    res.json({ success: true, subbots });
  } catch (error) {
    console.error('Error listando subbots:', error);
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

// Endpoint para limpiar subbots inactivos (solo admin)
router.post('/cleanup', [authenticateToken, authorizeRoles(['admin'])], async (req, res) => {
  try {
    await cleanupInactiveSubbots();
    res.json({ success: true, message: 'Limpieza completada' });
  } catch (error) {
    console.error('Error limpiando subbots:', error);
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

// Endpoint para obtener estadsticas de subbots (solo admin)
router.get('/stats', [authenticateToken, authorizeRoles(['admin'])], async (req, res) => {
  try {
    const stats = await getSubbotStats();
    res.json({ success: true, stats });
  } catch (error) {
    console.error('Error obteniendo estadsticas:', error);
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

export default router;

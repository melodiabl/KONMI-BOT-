import express from 'express';
import { 
  registerSubbotEvent, 
  getSubbotStatus, 
  getSubbot, 
  listSubbots, 
  createSubbot, 
  deleteSubbot, 
  executeSubbotCommand, 
  getSubbotCommands,
  cleanupInactiveSubbots 
} from './subbot-manager.js';

const router = express.Router();

// Middleware para parsear JSON
router.use(express.json());

/**
 * POST /api/subbot/event
 * Registrar evento de subbot
 */
router.post('/event', async (req, res) => {
  try {
    const { subbotId, event, data, timestamp } = req.body;
    
    if (!subbotId || !event) {
      return res.status(400).json({ 
        success: false, 
        error: 'subbotId y event son requeridos' 
      });
    }

    const result = await registerSubbotEvent(subbotId, event, data);
    res.json(result);
  } catch (error) {
    console.error('Error en /api/subbot/event:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Error interno del servidor' 
    });
  }
});

/**
 * GET /api/subbot/status
 * Obtener estado de todos los subbots
 */
router.get('/status', (req, res) => {
  try {
    const status = getSubbotStatus();
    res.json({ success: true, subbots: status });
  } catch (error) {
    console.error('Error en /api/subbot/status:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Error interno del servidor' 
    });
  }
});

/**
 * GET /api/subbot/list
 * Listar todos los subbots
 */
router.get('/list', async (req, res) => {
  try {
    const subbots = await listSubbots();
    res.json({ success: true, subbots });
  } catch (error) {
    console.error('Error en /api/subbot/list:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Error interno del servidor' 
    });
  }
});

/**
 * POST /api/subbot/create
 * Crear nuevo subbot
 */
router.post('/create', async (req, res) => {
  try {
    const { userId, type } = req.body;
    
    if (!userId) {
      return res.status(400).json({ 
        success: false, 
        error: 'userId es requerido' 
      });
    }

    const result = await createSubbot(userId, type);
    res.json(result);
  } catch (error) {
    console.error('Error en /api/subbot/create:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Error interno del servidor' 
    });
  }
});

/**
 * DELETE /api/subbot/:subbotId
 * Eliminar subbot
 */
router.delete('/:subbotId', async (req, res) => {
  try {
    const { subbotId } = req.params;
    
    const result = await deleteSubbot(subbotId);
    res.json(result);
  } catch (error) {
    console.error('Error en /api/subbot/delete:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Error interno del servidor' 
    });
  }
});

/**
 * POST /api/subbot/execute
 * Ejecutar comando en subbot
 */
router.post('/execute', async (req, res) => {
  try {
    const { subbotId, command, from, group, timestamp } = req.body;
    
    if (!subbotId || !command) {
      return res.status(400).json({ 
        success: false, 
        error: 'subbotId y command son requeridos' 
      });
    }

    const result = await executeSubbotCommand(subbotId, command, from, group);
    res.json(result);
  } catch (error) {
    console.error('Error en /api/subbot/execute:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Error interno del servidor' 
    });
  }
});

/**
 * GET /api/subbot/commands/:subbotId
 * Obtener comandos para subbot
 */
router.get('/commands/:subbotId', async (req, res) => {
  try {
    const { subbotId } = req.params;
    
    const result = await getSubbotCommands(subbotId);
    res.json(result);
  } catch (error) {
    console.error('Error en /api/subbot/commands:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Error interno del servidor' 
    });
  }
});

/**
 * POST /api/subbot/cleanup
 * Limpiar subbots inactivos
 */
router.post('/cleanup', async (req, res) => {
  try {
    const result = await cleanupInactiveSubbots();
    res.json(result);
  } catch (error) {
    console.error('Error en /api/subbot/cleanup:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Error interno del servidor' 
    });
  }
});

export default router;
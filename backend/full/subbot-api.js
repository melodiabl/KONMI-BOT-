import express from 'express';
import { authenticateToken, authorizeRoles } from './auth.js';
import {
  launchSubbot,
  deleteSubbot,
  fetchSubbotListWithOnlineFlag,
  getSubbotStatus,
  registerSubbotEvent,
  getSubbotByCode,
  onSubbotEvent
} from './subproc-subbots.js';

const router = express.Router();

router.post('/event', async (req, res) => {
  try {
    const { subbotId, token, event, data } = req.body || {};
    const result = await registerSubbotEvent({ subbotId, token, event, data });
    if (!result.success) {
      return res.status(400).json(result);
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.use(authenticateToken);
router.use(authorizeRoles('admin', 'owner'));

router.get('/list', async (_req, res) => {
  try {
    const subbots = await fetchSubbotListWithOnlineFlag();
    res.json({ success: true, subbots });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/status', async (_req, res) => {
  try {
    const subbots = await getSubbotStatus();
    res.json({ success: true, subbots });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/create', async (req, res) => {
  try {
    const { type = 'qr', phoneNumber = null } = req.body || {};
    const requester = req.user?.username || null;
    const sanitizedNumber = phoneNumber ? String(phoneNumber).replace(/[^0-9]/g, '') : null;

    if (type === 'code' && (!sanitizedNumber || sanitizedNumber.length < 7)) {
      return res.status(400).json({ success: false, error: 'Número de emparejamiento inválido.' });
    }

    const result = await launchSubbot({
      type,
      createdBy: requester,
      requestJid: null,
      requestParticipant: null,
      targetNumber: type === 'code' ? sanitizedNumber : null,
      metadata: { source: 'panel', requester }
    });

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json({ success: true, subbotId: result.subbot.code });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/:code', async (req, res) => {
  try {
    const { code } = req.params;
    const result = await deleteSubbot(code);
    if (!result.success) {
      return res.status(400).json(result);
    }
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// QR se entrega por eventos y DM; este endpoint puede ser omitido en modo in-proc

router.get('/details/:code', async (req, res) => {
  try {
    const subbot = await getSubbotByCode(req.params.code);
    if (!subbot) {
      return res.status(404).json({ success: false, error: 'Subbot no encontrado' });
    }
    res.json({ success: true, subbot });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Eventos/Logs de sub-bots
router.get('/events', async (req, res) => {
  try {
    const code = req.query.code ? String(req.query.code) : null;
    const page = Math.max(1, parseInt(req.query.page || '1'));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '50')));
    const offset = (page - 1) * limit;
    let q = db('subbot_events').select('*').orderBy('id','desc').limit(limit).offset(offset);
    if (code) q = q.where({ code });
    const rows = await q;
    res.json({ success:true, page, limit, events: rows });
  } catch (error) {
    res.status(500).json({ success:false, error: error.message });
  }
});

// SSE live stream de eventos
const sseClients = new Set();
onSubbotEvent('qr_ready', (p) => broadcastSse({ type:'qr_ready', ...p }));
onSubbotEvent('pairing_code', (p) => broadcastSse({ type:'pairing_code', ...p }));
onSubbotEvent('connected', (p) => broadcastSse({ type:'connected', ...p }));
onSubbotEvent('disconnected', (p) => broadcastSse({ type:'disconnected', ...p }));
onSubbotEvent('error', (p) => broadcastSse({ type:'error', ...p }));
onSubbotEvent('stopped', (p) => broadcastSse({ type:'stopped', ...p }));
onSubbotEvent('launch', (p) => broadcastSse({ type:'launch', ...p }));

function broadcastSse(payload){
  const data = `data: ${JSON.stringify(payload)}\n\n`;
  for (const client of sseClients){
    try {
      if (!client.filter || client.filter === payload?.subbot?.code) {
        client.res.write(data);
      }
    } catch (_) {}
  }
}

router.get('/events/stream', async (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive'
  });
  const filter = req.query.code ? String(req.query.code) : null;
  const client = { res, filter };
  sseClients.add(client);
  req.on('close', () => sseClients.delete(client));
  res.write(`data: ${JSON.stringify({ type:'hello', filter })}\n\n`);
});

export default router;

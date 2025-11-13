import { buildQuickReplyFlow } from '../utils/flows.js'
import {
  generateSubbotPairingCode,
  generateSubbotQR,
  attachSubbotListeners,
  detachSubbotListeners,
} from '../lib/subbots.js';

const normalizeDigits = (v) => String(v || '').replace(/\D/g, '');

const checkSubbotAccess = (isOwner) => {
  const access = String(process.env.SUBBOTS_ACCESS || 'all').toLowerCase();
  if (access === 'owner' && !isOwner) {
    throw new Error('⛔ Solo el owner puede usar este comando.');
  }
};

export async function qr(ctx) {
  const { usuario, isOwner, sock, remoteJid } = ctx;
  checkSubbotAccess(isOwner);
  const owner = normalizeDigits(usuario);
  const { code } = await generateSubbotQR(owner, { displayName: 'KONMI-BOT' });
  if (!code) throw new Error('❌ Error al crear el subbot QR');

  // Notify on connection
  attachSubbotListeners(code, [{
    event: 'connected',
    handler: async (payload) => {
      try {
        const data = payload?.data || {};
        const linked = normalizeDigits(data?.jid);
        const parts = [`🎉 ¡Subbot conectado!`, `🆔 SubBot: ${code}`, linked && `🤝 Vinculado: +${linked}`].filter(Boolean);
        await sock.sendMessage(remoteJid, { text: parts.join('\n'), mentions: [usuario] });
      } finally {
        detachSubbotListeners(code);
      }
    }
  }]);

  // Wait for QR code
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      detachSubbotListeners(code);
      reject(new Error('⏱️ Timeout esperando QR. Intenta de nuevo.'));
    }, 30000);

    attachSubbotListeners(code, [{
      event: 'qr_ready',
      handler: (payload) => {
        clearTimeout(timeout);
        detachSubbotListeners(code);
        const data = payload?.data || payload;
        const img = Buffer.from((data.qrImage || '').split(',')[1] || data.qrImage, 'base64');
        const flow = buildQuickReplyFlow({
          header: 'Subbot QR listo',
          body: `🆔 SubBot: ${code}\n📱 Número: +${owner}`,
          buttons: [
            { text: '📋 Copiar número', copy: owner },
            { text: '🤖 Mis Subbots', command: '/mybots' },
            { text: '🏠 Menú', command: '/menu' },
          ],
        });
        resolve([
          { type: 'image', image: img, caption: `🆔 SubBot: ${code}\n📱 Número: +${owner}`, mentions: [usuario] },
          { type: 'content', content: flow },
        ]);
      }
    }]);
  });
}

export async function code(ctx) {
  const { usuario, isOwner, sock, remoteJid } = ctx;
  checkSubbotAccess(isOwner);
  const phone = normalizeDigits(usuario);
  if (!phone || phone.length < 8) return { message: '❌ Número inválido. Debe tener al menos 8 dígitos.' };

  const { code } = await generateSubbotPairingCode(phone, phone, { displayName: 'KONMI-BOT' });
  if (!code) throw new Error('❌ Error al crear el subbot');

  // Notify on connection
  attachSubbotListeners(code, [{
    event: 'connected',
    handler: async (payload) => {
      try {
        const data = payload?.data || {};
        const linked = normalizeDigits(data?.jid);
        const parts = [`🎉 ¡Subbot conectado!`, `🆔 SubBot: ${code}`, linked && `🤝 Vinculado: +${linked}`].filter(Boolean);
        await sock.sendMessage(remoteJid, { text: parts.join('\n'), mentions: [usuario] });
      } finally {
        detachSubbotListeners(code);
      }
    }
  }]);

  // Wait for pairing code
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      detachSubbotListeners(code);
      reject(new Error('⏱️ Timeout esperando código. Intenta nuevamente.'));
    }, 30000);

    attachSubbotListeners(code, [{
      event: 'pairing_code',
      handler: (payload) => {
        clearTimeout(timeout);
        detachSubbotListeners(code);
        const pairing = payload?.data?.pairingCode || payload?.data?.code;
        if (pairing) {
          const flow = buildQuickReplyFlow({
            header: '🔢 Código de vinculación',
            body: `Código: ${pairing}`,
            buttons: [
              { text: '📋 Copiar código', copy: pairing },
              { text: '🤖 Mis Subbots', command: '/mybots' },
              { text: '🏠 Menú', command: '/menu' },
            ],
          });
          resolve([
            { message: `✅ Código de vinculación: *${pairing}*\n📱 Número: +${phone}`, mentions: [usuario] },
            { type: 'content', content: flow },
          ]);
        } else {
          reject(new Error('❌ No se pudo obtener el código de emparejamiento.'));
        }
      }
    }]);
  });
}


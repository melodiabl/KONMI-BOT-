import { buildQuickReplyFlow } from './utils/flows.js'
import { sendCopyableCode, sendInteractiveButtons } from './ui-interactive.js'

import {
  generateSubbotPairingCode,
  generateSubbotQR,
  attachSubbotListeners,
  detachSubbotListeners,
} from '../lib/subbots.js';
import { getBotStatus } from '../../whatsapp.js';

// 🔧 NUEVO: Importar directamente desde inproc-subbots para registrar listener global
import { onSubbotEvent, offSubbotEvent } from './services/inproc-subbots.js';

// Funcionalidad Wileys: Reacciones automáticas para subbots
const addSubbotReaction = async (sock, message, emoji = '🤖') => {
  try {
    if (sock && message?.key) {
      await sock.sendMessage(message.key.remoteJid, {
        react: { text: emoji, key: message.key }
      });
    }
  } catch (error) {
    console.error('[SUBBOT_PAIRING_REACTION] Error:', error);
  }
};

function normalizeDigits(v) { return String(v || '').replace(/[^0-9]/g, '') }

async function extractPhoneNumber(ctx) {
  const { usuarioNumber, senderNumber, sender, message, remoteJid, sock } = ctx || {};
  const args = Array.isArray(ctx?.args) ? ctx.args : [];

  const sanitize = (v) => String(v || '').replace(/\D/g, '');
  const isE164Generic = (d) => {
    const s = sanitize(d);
    return s.length >= 8 && s.length <= 15;
  };

  const candidates = [];

  const argDigits = sanitize((args[0] || '').toString());
  if (isE164Generic(argDigits)) candidates.push(argDigits);

  const senderNum = sanitize(senderNumber);
  if (isE164Generic(senderNum)) candidates.push(senderNum);

  const usuarioNum = sanitize(usuarioNumber);
  if (isE164Generic(usuarioNum)) candidates.push(usuarioNum);

  const isLidSender = typeof sender === 'string' && sender.includes('@lid');
  if (sender && !isLidSender) {
    const base = typeof sender === 'string' && sender.includes('@') ? sender.split('@')[0] : sender;
    const d = sanitize(base);
    if (isE164Generic(d)) candidates.push(d);
  }

  if (message?.key?.participant) {
    const part = message.key?.participant;
    const isLidPart = typeof part === 'string' && part.includes('@lid');
    if (!isLidPart) {
      const base = typeof part === 'string' && part.includes('@') ? part.split('@')[0] : part;
      const d = sanitize(base);
      if (isE164Generic(d)) candidates.push(d);
    }
  }

  try {
    const isLidChat = typeof remoteJid === 'string' && remoteJid.includes('@lid');
    if (isLidChat && sock && typeof sock.onWhatsApp === 'function' && sender) {
      const res = await sock.onWhatsApp(sender);
      const found = Array.isArray(res) && res.find(x => typeof x?.jid === 'string' && x.jid.endsWith('@s.whatsapp.net'));
      if (found) {
        const d = sanitize(found.jid.split('@')[0]);
        if (isE164Generic(d)) candidates.push(d);
      }
    }
  } catch {}

  for (const d of candidates) {
    if (isE164Generic(d)) return d;
  }
  return null;
}

export async function qr(ctx) {
  try {
    const { isOwner, sock, remoteJid, message } = ctx || {};

    // Funcionalidad Wileys: Reacción automática
    await addSubbotReaction(sock, message, '📱');

    // Los subbots están disponibles para todos
    // const access = String(process.env.SUBBOTS_ACCESS || 'all').toLowerCase()
    // if (access === 'owner' && !isOwner) {
    //   return { success:false, message:'⛔ Solo el owner puede usar /qr (subbots).', quoted: true }
    // }

    const owner = await extractPhoneNumber(ctx);
    if (!owner) {
      return { success:false, message:'❌ No pude detectar un número válido en formato internacional (8-15 dígitos). Usa /code <tu_numero_en_formato_internacional>.' }
    }

    const res = await generateSubbotQR(owner, { displayName: 'KONMI-BOT' });
    const code = res?.code;
    if (!code) return { success:false, message:'❌ Error al crear el subbot QR' };

    return await new Promise((resolve) => {
      let detachAll = null;
      const timeout = setTimeout(() => { try { detachAll?.() } catch {}; resolve({ success:false, message:'⏱️ Timeout esperando QR (60s). Intenta de nuevo.' }) }, 60000);

      const onConnected = async (payload) => {
        try {
          detachSubbotListeners(code, (ev, handler) => ev === 'connected' && handler === onConnected)
        } catch {}

        try {
          const data = payload?.data || payload || {}
          const linked = String(data?.digits || data?.number || data?.jid || '').replace(/\D/g, '')
          const parts = [
            '✅ Subbot conectado exitosamente',
            `🆔 SubBot: ${code}`,
            linked ? `📱 Vinculado: +${linked}` : null,
          ].filter(Boolean)
          await sock?.sendMessage?.(remoteJid, { text: parts.join('\n') })
        } catch {}
      }

      const onQRReady = (payload) => {
        try { clearTimeout(timeout); detachSubbotListeners(code, (ev, handler) => ev === 'qr_ready' && handler === onQRReady) } catch {}
        const data = payload?.data || payload;
        if (data?.qrImage) {
          try {
            const src = String(data.qrImage || '')
            let img
            if (src.startsWith('data:')) {
              const base64 = src.split(',')[1] || ''
              img = Buffer.from(base64, 'base64')
            } else {
              img = Buffer.from(src, 'base64')
            }
            const mentionJid = owner ? `${owner}@s.whatsapp.net` : undefined
            const flow = buildQuickReplyFlow({
              header: 'Subbot QR listo',
              body: `🆔 SubBot: ${code}\n📱 Número: +${owner}`,
              footer: 'Acciones',
              buttons: [
                { text: '📋 Copiar número', copy: owner },
                { text: '🤖 Mis Subbots', command: '/mybots' },
                { text: '🏠 Menú', command: '/menu' },
              ],
            })
            resolve([
              { success:true, type:'image', image: img, caption:`🆔 SubBot: ${code}\n📱 Número: +${owner}`, mentions: mentionJid ? [mentionJid] : undefined, quoted: true, ephemeralDuration: 300 },
              { type:'content', content: flow, quoted: true, ephemeralDuration: 300 }
            ]);
          } catch {
            resolve({ success:false, message:'⚠️ QR no disponible' });
          }
        } else {
          resolve({ success:false, message:'⚠️ QR no disponible' });
        }
      };

      try {
        detachAll = attachSubbotListeners(code, [
          { event: 'qr_ready', handler: onQRReady },
          { event: 'connected', handler: onConnected },
        ]);
      } catch (e) {
        clearTimeout(timeout);
        resolve({ success:false, message:`⚠️ Error registrando listeners: ${e?.message||e}` });
      }
    });
  } catch (e) {
    return { success:false, message:`⚠️ Error generando QR: ${e?.message||e}` };
  }
}

export async function code(ctx) {
  try {
    const { isOwner, sock, remoteJid, pushName, usuarioName, message } = ctx || {};

    // Funcionalidad Wileys: Reacción automática
    await addSubbotReaction(sock, message, '🔑');

    // Los subbots están disponibles para todos
    // const access = String(process.env.SUBBOTS_ACCESS || 'all').toLowerCase()
    // if (access === 'owner' && !isOwner) {
    //   return { success:false, message:'⛔ Solo el owner puede usar /code (subbots).', quoted: true }
    // }

    const phone = await extractPhoneNumber(ctx);
    if (!phone) {
      const hint = Array.isArray(ctx?.args) && ctx.args.length ?
        '❌ El número proporcionado no es válido. Debe tener 8-15 dígitos (formato internacional sin el +).' :
        '❌ No pude detectar tu número de WhatsApp. Por favor, proporciona tu número: /code <tu_numero>';
      return { success:false, message:hint }
    }

    // Generar el subbot y obtener el código directamente
    const res = await generateSubbotPairingCode(phone, phone, { displayName: 'KONMI-BOT' });
    const codeValue = res?.code;
    const pairingCode = res?.pairingCode;

    console.log(`[pairing.js] 🚀 Subbot creado:`, { code: codeValue, pairingCode });

    if (!codeValue) {
      return { success: false, message: '❌ Error al crear el subbot' };
    }

    if (!pairingCode) {
      return {
        success: false,
        message: `⚠️ Subbot creado (${codeValue}) pero no se generó código de vinculación. Intenta de nuevo.`
      };
    }

    // Devolver el código inmediatamente
    const messageText = `✅ *Código de Vinculación Generado*\n\n` +
      `🔢 *Código:* \`${pairingCode}\`\n` +
      `📱 *Número:* +${phone}\n` +
      `🆔 *SubBot ID:* ${codeValue}\n\n` +
      `📋 *INSTRUCCIONES:*\n` +
      `1️⃣ Abre WhatsApp en tu teléfono\n` +
      `2️⃣ Ve a *Dispositivos vinculados*\n` +
      `3️⃣ Toca *"Vincular con número de teléfono"*\n` +
      `4️⃣ Ingresa este código: *${pairingCode}*\n\n` +
      `⏱️ El código expira en 5 minutos\n` +
      `💡 Recibirás una confirmación cuando se vincule`;

    return {
      success: true,
      message: messageText,
      mentions: phone ? [`${phone}@s.whatsapp.net`] : undefined,
      quoted: true
    };

  } catch (e) {
    return { success:false, message:`⚠️ Error generando code: ${e?.message||e}` };
  }
}

export async function requestMainBotPairingCode(ctx) {
  try {
    const { isOwner, sock, remoteJid } = ctx || {};

    if (!isOwner) {
      return { success: false, message: '⛔ Solo el owner puede solicitar código de emparejamiento del bot principal.', quoted: true }
    }

    const { requestMainBotPairingCode: requestCode } = await import('../../whatsapp.js');
    const result = await requestCode();

    if (result.success) {
      return {
        success: true,
        message: `✅ Código de emparejamiento solicitado. Usa /maincode para verlo.`,
        quoted: true
      };
    } else {
      return {
        success: false,
        message: `❌ Error solicitando código: ${result.message}`,
        quoted: true
      };
    }

  } catch (e) {
    return { success: false, message: `⚠️ Error solicitando código del bot principal: ${e?.message || e}`, quoted: true };
  }
}

export async function mainCode(ctx) {
  try {
    const { isOwner, sock, remoteJid } = ctx || {};

    if (!isOwner) {
      return { success: false, message: '⛔ Solo el owner puede ver el código de emparejamiento del bot principal.', quoted: true }
    }

    const botStatus = getBotStatus();

    if (!botStatus.pairingCode) {
      return {
        success: false,
        message: '❌ No hay código de emparejamiento disponible. Usa /requestcode para generar uno nuevo.',
        quoted: true
      }
    }

    const codeMessage = `🔐 *CÓDIGO DE EMPAREJAMIENTO DEL BOT PRINCIPAL*\n\n` +
      `📱 Número: ${botStatus.pairingNumber || 'N/A'}\n` +
      `🔑 Código: \`${botStatus.pairingCode}\`\n` +
      `⏰ Generado: ${botStatus.timestamp ? new Date(botStatus.timestamp).toLocaleString('es-ES') : 'N/A'}\n\n` +
      `💡 *Instrucciones:*\n` +
      `1. Ve a WhatsApp > Dispositivos vinculados\n` +
      `2. Toca "Vincular un dispositivo"\n` +
      `3. Ingresa el código de arriba\n\n` +
      `⚠️ El código expira en 10 minutos.`;

    return sendCopyableCode(botStatus.pairingCode, codeMessage);

  } catch (e) {
    return { success: false, message: `⚠️ Error obteniendo código del bot principal: ${e?.message || e}`, quoted: true };
  }
}

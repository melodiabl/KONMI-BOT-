import { buildQuickReplyFlow } from '../utils/utils/flows.js'
import { sendCopyableCode, sendInteractiveButtons } from './ui-interactive.js'

import {
  generateSubbotPairingCode,
  generateSubbotQR,
  attachSubbotListeners,
  detachSubbotListeners,
} from '../lib/subbots.js';
import { getBotStatus } from '../../whatsapp.js';

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

  // 1) Argumento: debe venir en formato internacional (8-15 dígitos)
  const argDigits = sanitize((args[0] || '').toString());
  if (isE164Generic(argDigits)) candidates.push(argDigits);

  // 2) senderNumber es la fuente más confiable del usuario actual
  const senderNum = sanitize(senderNumber);
  if (isE164Generic(senderNum)) candidates.push(senderNum);

  // 3) Otros campos del contexto
  const usuarioNum = sanitize(usuarioNumber);
  if (isE164Generic(usuarioNum)) candidates.push(usuarioNum);

  // 4) Extraer de sender directo
  const isLidSender = typeof sender === 'string' && sender.includes('@lid');
  if (sender && !isLidSender) {
    const base = typeof sender === 'string' && sender.includes('@') ? sender.split('@')[0] : sender;
    const d = sanitize(base);
    if (isE164Generic(d)) candidates.push(d);
  }

  // 5) Extraer de participante del mensaje
  if (message?.key?.participant) {
    const part = message.key?.participant;
    const isLidPart = typeof part === 'string' && part.includes('@lid');
    if (!isLidPart) {
      const base = typeof part === 'string' && part.includes('@') ? part.split('@')[0] : part;
      const d = sanitize(base);
      if (isE164Generic(d)) candidates.push(d);
    }
  }

  // 6) Resolver LID con onWhatsApp -> @s.whatsapp.net
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

  // 7) Elegir el primero válido
  for (const d of candidates) {
    if (isE164Generic(d)) return d;
  }
  return null;
}

export async function qr(ctx) {
  try {
    const { isOwner, sock, remoteJid } = ctx || {};
    
    const access = String(process.env.SUBBOTS_ACCESS || 'all').toLowerCase()
    if (access === 'owner' && !isOwner) {
      return { success:false, message:'⛔ Solo el owner puede usar /qr (subbots).', quoted: true }
    }
    
    const owner = await extractPhoneNumber(ctx);
    if (!owner) {
      return { success:false, message:'❌ No pude detectar un número válido en formato internacional (8-15 dígitos). Usa /code <tu_numero_en_formato_internacional>.' }
    }
    
    const res = await generateSubbotQR(owner, { displayName: 'KONMI-BOT' });
    const code = res?.code;
    if (!code) return { success:false, message:'❌ Error al crear el subbot QR' };

    // Registrar listener INMEDIATAMENTE después de crear el subbot (antes de que emita el QR)
    return await new Promise((resolve) => {
      let detach = null;
      const timeout = setTimeout(() => { try { detach?.() } catch {}; resolve({ success:false, message:'⏱️ Timeout esperando QR (60s). Intenta de nuevo.' }) }, 60000);
      
      const onQRReady = (payload) => {
        try { clearTimeout(timeout); detach?.() } catch {}
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
        detach = attachSubbotListeners(code, [{ event: 'qr_ready', handler: onQRReady }]);
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
    const { isOwner, sock, remoteJid } = ctx || {};

    const access = String(process.env.SUBBOTS_ACCESS || 'all').toLowerCase();
    if (access === 'owner' && !isOwner) {
      return {
        success: false,
        message: '⛔ Solo el owner puede usar /code (subbots).',
        quoted: true,
      };
    }

    const phone = await extractPhoneNumber(ctx);
    if (!phone) {
      const hint =
        Array.isArray(ctx?.args) && ctx.args.length
          ? '❌ El número proporcionado no es válido. Debe tener 8-15 dígitos (formato internacional sin el +).'
          : '❌ No pude detectar tu número de WhatsApp. Por favor, proporciona tu número: /code <tu_numero>';
      return { success: false, message: hint };
    }

    const creatorPushName = ctx.pushName || ctx.usuarioName || phone;
    const identification = `KONMISUB(${creatorPushName})`;

    // 1) Lanzar el subbot en modo pairing
    const res = await generateSubbotPairingCode(phone, phone, {
      displayName: 'KONMI-BOT',
      creatorPushName,
      requestJid: remoteJid,
    });

    const subbotCode = res?.code; // ← código interno tipo SUB-XXXX
    if (!subbotCode) {
      return {
        success: false,
        message: '❌ Error al crear el subbot',
        quoted: true,
      };
    }

    // 2) Si tenemos sock, enganchamos listeners para pairing_code y connected
    if (sock) {
      const dmJid = phone ? `${phone}@s.whatsapp.net` : remoteJid || null;

      // 🔐 Listener para el código de emparejamiento REAL de Baileys
      const onPairingCode = async (payload) => {
        try {
          const data = payload?.data || {};
          const pairing =
            String(data.pairingCode || data.code || '')
              .trim();

          if (!pairing) {
            await sock.sendMessage(dmJid, {
              text: '⚠️ No se pudo obtener el código de vinculación del subbot.',
            });
            return;
          }

          const lines = [
            '✅ Código de vinculación',
            '',
            `🔢 Código: *${pairing}*`,
            `🆔 Identificación: ${identification}`,
            `📱 Número: +${phone}`,
            '',
            'Instrucciones:',
            '1. WhatsApp > Dispositivos vinculados',
            '2. Vincular con número de teléfono',
            '3. Ingresa el código mostrado',
          ].join('\n');

          const mention = phone ? `${phone}@s.whatsapp.net` : undefined;

          // Enviar al privado
          if (dmJid) {
            await sock.sendMessage(dmJid, {
              text: lines,
              mentions: mention ? [mention] : undefined,
            });

            // Texto de acciones rápidas simple
            await sock.sendMessage(dmJid, {
              text:
                'Acciones rápidas\n' +
                `• \`/copy ${pairing}\` - 📋 Copiar código\n` +
                '• `/mybots` - 🤖 Mis Subbots\n' +
                '• `/qr` - 🧾 QR Subbot\n' +
                '• `/menu` - 🏠 Menú',
            });
          }

          // Si se ejecutó en grupo, replicar ahí
          const isGroup =
            typeof remoteJid === 'string' && remoteJid.endsWith('@g.us');
          if (isGroup && remoteJid) {
            const gLines = [
              `✅ Código de vinculación para @${phone}`,
              '',
              `🔢 Código: *${pairing}*`,
              `🆔 Identificación: ${identification}`,
              `📱 Número: +${phone}`,
            ].join('\n');

            await sock.sendMessage(remoteJid, {
              text: gLines,
              mentions: mention ? [mention] : undefined,
            });

            await sock.sendMessage(remoteJid, {
              text:
                'Acciones rápidas\n' +
                `• \`/copy ${pairing}\` - 📋 Copiar código\n` +
                '• `/mybots` - 🤖 Mis Subbots\n' +
                '• `/qr` - 🧾 QR Subbot\n' +
                '• `/menu` - 🏠 Menú',
            });
          }
        } finally {
          try {
            detachSubbotListeners(subbotCode, (evt, handler) => handler === onPairingCode);
          } catch {}
        }
      };

      // 🎉 Listener para cuando el subbot ya está conectado
      const onConnected = async (payload) => {
        try {
          const data = payload?.data || {};
          const linked = String(
            data?.digits || data?.number || data?.jid || '',
          ).replace(/\D/g, '');

          const baseLines = [
            '🎉 Listo, ¡ya eres un subbot más de la comunidad!\n',
            `🆔 SubBot: ${identification}`,
            linked ? `🤝 Vinculado: +${linked}` : null,
          ].filter(Boolean);

          if (dmJid) {
            await sock.sendMessage(dmJid, { text: baseLines.join('\n') });
          }

          const isGroup =
            typeof remoteJid === 'string' && remoteJid.endsWith('@g.us');
          if (isGroup && remoteJid) {
            const mention = phone ? `${phone}@s.whatsapp.net` : undefined;
            const gLines = [
              `🎉 ${mention ? '@' + phone : 'Listo'}, ¡ya eres un subbot más de la comunidad!`,
              `🆔 SubBot: ${identification}`,
              linked ? `🤝 Vinculado: +${linked}` : null,
            ].filter(Boolean);

            await sock.sendMessage(remoteJid, {
              text: gLines.join('\n'),
              mentions: mention ? [mention] : undefined,
            });
          }
        } finally {
          try {
            detachSubbotListeners(subbotCode, (evt, handler) => handler === onConnected);
          } catch {}
        }
      };

      // Registrar listeners para este subbot
      attachSubbotListeners(subbotCode, [
        { event: 'pairing_code', handler: onPairingCode },
        { event: 'connected', handler: onConnected },
      ]);
    }

    // 3) Respuesta inmediata al comando (el código real lo envía el listener)
    return {
      success: true,
      message: '⏳ Generando código de vinculación...',
      quoted: true,
    };
  } catch (e) {
    return {
      success: false,
      message: `⚠️ Error generando code: ${e?.message || e}`,
      quoted: true,
    };
  }
}

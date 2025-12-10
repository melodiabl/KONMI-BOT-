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
    const { isOwner } = ctx || {};
    
    const access = String(process.env.SUBBOTS_ACCESS || 'all').toLowerCase();
    if (access === 'owner' && !isOwner) {
      return { success:false, message:'⛔ Solo el owner puede usar /code (subbots).', quoted: true };
    }
    
    const phone = await extractPhoneNumber(ctx);
    if (!phone) {
      const hint = Array.isArray(ctx?.args) && ctx.args.length ? 
        '❌ El número proporcionado no es válido. Debe tener 8-15 dígitos (formato internacional sin el +).' :
        '❌ No pude detectar tu número de WhatsApp. Por favor, proporciona tu número: /code <tu_numero>';
      return { success:false, message:hint };
    }
    
    const creatorPushName = ctx.pushName || ctx.usuarioName || phone;

    // Crear subbot y obtener datos de emparejamiento desde tu Baileys
    const res = await generateSubbotPairingCode(
      phone,
      phone,
      { displayName: 'KONMI-BOT', creatorPushName }
    );

    // ID interno del subbot (por si lo necesitas en otro lado)
    const codeValue = res?.code;

    // 👉 AQUÍ TOMAMOS EL CÓDIGO TAL CUAL LO DA BAILEYS (KONM-IBOT, etc.)
    const pairing =
      res?.code ||         // ej: "KONM-IBOT" (lo que ves en los logs [PAIRING])
      res?.pairingCode ||  // por si viene así
      res?.pairing ||      // fallback
      res?.custom ||       // por si guardas el custom aquí
      null;

    if (!pairing) {
      return {
        success: false,
        message: '❌ No pude obtener el código de vinculación del subbot.',
        quoted: true,
      };
    }

    const identification = `KONMISUB(${creatorPushName})`;

    // ===== RESPUESTA PRINCIPAL (SIN NINGÚN CÓDIGO NUMÉRICO INVENTADO) =====
    const primary = {
      success: true,
      message:
        `✅ Código de vinculación\n\n` +
        `🔢 Código: *${pairing}*\n` +           // 👈 AQUÍ VA, POR EJEMPLO: KONM-IBOT
        `🆔 Identificación: ${identification}\n` +
        `📱 Número: +${phone}\n\n` +
        `Instrucciones:\n` +
        `1. WhatsApp > Dispositivos vinculados\n` +
        `2. Vincular con número de teléfono\n` +
        `3. Ingresa el código mostrado`,
      mentions: (phone ? [`${phone}@s.whatsapp.net`] : undefined),
      quoted: true,
      ephemeralDuration: 600,
    };

    const copyContent = {
      type: 'content',
      content: sendCopyableCode(
        pairing, // 👈 el mismo código alfanumérico
        '🔢 *CÓDIGO DE VINCULACIÓN*\n' +
        '📱 Tu número: +' + phone + '\n\n' +
        '🆔 Identificación: ' + identification + '\n' +
        '⏱️ Válido por 10 minutos'
      ),
      quoted: true,
      ephemeralDuration: 600,
    };

    const quickFlow = buildQuickReplyFlow({
      header: '🔢 Código de vinculación',
      body: `Código: ${pairing}\nIdentificación: ${identification}`,
      footer: 'Toca "Copiar código"',
      buttons: [
        { text: '📋 Copiar código', command: '/copy ' + pairing },
        { text: '🤖 Mis Subbots', command: '/mybots' },
        { text: '🧾 QR Subbot', command: '/qr' },
        { text: '🏠 Menú', command: '/menu' },
      ],
    });

    const quickContent = {
      type: 'content',
      content: quickFlow,
      quoted: true,
      ephemeralDuration: 600,
    };

    const buttonsContent = {
      type: 'buttons',
      text: 'Acciones rápidas',
      footer: 'KONMI BOT',
      buttons: [
        { text: '📋 Copiar código', command: '/copy ' + pairing },
        { text: '🤖 Mis Subbots', command: '/mybots' },
        { text: '🧾 QR Subbot', command: '/qr' },
        { text: '🏠 Menú', command: '/menu' }
      ],
      quoted: true,
      ephemeralDuration: 300,
    };

    // Devolvemos todas las piezas para que el router las mande
    return [primary, copyContent, quickContent, buttonsContent];

  } catch (e) {
    return { success:false, message:`⚠️ Error generando code: ${e?.message||e}`, quoted: true };
  }
}

export async function requestMainBotPairingCode(ctx) {
  try {
    const { isOwner, sock, remoteJid } = ctx || {};

    if (!isOwner) {
      return { success: false, message: '⛔ Solo el owner puede solicitar código de emparejamiento del bot principal.', quoted: true }
    }

    // Import the function to request pairing code for main bot
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

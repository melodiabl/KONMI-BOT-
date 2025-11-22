import { buildQuickReplyFlow } from '../utils/flows.js'
import { sendCopyableCode, sendInteractiveButtons } from './ui-interactive.js'

import {
  generateSubbotPairingCode,
  generateSubbotQR,
  attachSubbotListeners,
  detachSubbotListeners,
} from '../lib/subbots.js';
import { getBotStatus } from '../whatsapp.js';

function normalizeDigits(v) { return String(v || '').replace(/[^0-9]/g, '') }

function extractPhoneNumber(ctx) {
  const { usuarioNumber, senderNumber, sender, message } = ctx || {};
  
  let candidates = [];
  
  if (usuarioNumber) candidates.push(normalizeDigits(usuarioNumber));
  if (senderNumber) candidates.push(normalizeDigits(senderNumber));
  if (sender) {
    if (typeof sender === 'string' && sender.includes('@')) {
      candidates.push(sender.split('@')[0].replace(/\D/g, ''));
    } else {
      candidates.push(normalizeDigits(sender));
    }
  }
  if (message?.key?.participant) {
    const part = message.key.participant;
    if (typeof part === 'string' && part.includes('@')) {
      candidates.push(part.split('@')[0].replace(/\D/g, ''));
    } else {
      candidates.push(normalizeDigits(part));
    }
  }
  
  for (const phone of candidates) {
    if (phone && phone.length >= 8) {
      return phone;
    }
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
    
    const owner = extractPhoneNumber(ctx);
    if (!owner) {
      return { success:false, message:'❌ No pude detectar tu número. Envíame un mensaje directo primero o escribe /whoami.' }
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
    
    const access = String(process.env.SUBBOTS_ACCESS || 'all').toLowerCase()
    if (access === 'owner' && !isOwner) {
      return { success:false, message:'⛔ Solo el owner puede usar /code (subbots).', quoted: true }
    }
    
    const phone = extractPhoneNumber(ctx);
    if (!phone) {
      return { success:false, message:'❌ Número inválido. Debe tener al menos 8 dígitos. Envíame un DM primero o usa /whoami.' }
    }
    
    const res = await generateSubbotPairingCode(phone, phone, { displayName: 'KONMI-BOT' });
    const codeValue = res?.code;
    if (!codeValue) return { success:false, message:'❌ Error al crear el subbot' };

    try {
      const dmJid = phone ? `${phone}@s.whatsapp.net` : (remoteJid || null)
      if (sock && dmJid) {
        const onConnected = async (payload) => {
          try {
            const data = payload?.data || {}
            const linked = String(data?.digits || data?.number || data?.jid || '').replace(/\D/g,'')
            const parts = [
              '🎉 Listo, ¡ya eres un subbot más de la comunidad!\n',
              `🆔 SubBot: ${codeValue}`,
              linked ? `🤝 Vinculado: +${linked}` : null,
            ].filter(Boolean)
            await sock.sendMessage(dmJid, { text: parts.join('\n') })
            try {
              const isGroup = typeof remoteJid === 'string' && remoteJid.endsWith('@g.us')
              if (isGroup) {
                const mention = phone ? `${phone}@s.whatsapp.net` : undefined
                const gLines = [
                  `🎉 ${mention ? '@'+phone : 'Listo'}, ¡ya eres un subbot más de la comunidad!`,
                  `🆔 SubBot: ${codeValue}`,
                  linked ? `🤝 Vinculado: +${linked}` : null,
                ].filter(Boolean)
                const payloadMsg = mention ? { text: gLines.join('\n'), mentions: [mention] } : { text: gLines.join('\n') }
                await sock.sendMessage(remoteJid, payloadMsg)
                try {
                  const buttons = [
                    { index: 1, quickReplyButton: { displayText: '🤖 Mis Subbots', id: '/mybots' } },
                    { index: 2, quickReplyButton: { displayText: '🧾 QR Subbot', id: '/qr' } },
                    { index: 3, quickReplyButton: { displayText: '🏠 Menú', id: '/menu' } },
                  ]
                  await sock.sendMessage(remoteJid, { text: 'Acciones rápidas', templateButtons: buttons })
                } catch {
                  try { await sock.sendMessage(remoteJid, { text: 'Acciones rápidas:\n• /mybots\n• /qr\n• /menu' }) } catch {}
                }
              }
            } catch {}
          } finally {
            try { detachSubbotListeners(codeValue, (evt, h) => h === onConnected) } catch {}
          }
        }
        attachSubbotListeners(codeValue, [{ event: 'connected', handler: onConnected }])
      }
    } catch {}
    
    return await new Promise((resolve) => {
      let detach = null;
      const timeout = setTimeout(() => { try { detach?.() } catch {}; resolve({ success:false, message:'⏱️ Timeout esperando código (60s). Intenta nuevamente.' }) }, 60000);
      try {
        detach = attachSubbotListeners(codeValue, [{
          event: 'pairing_code',
          handler: (payload) => {
            const data = payload?.data || payload;
            const pairing = data?.pairingCode || data?.code;
            if (pairing) {
              try { clearTimeout(timeout); detach?.() } catch {}
              const copyFlow = buildQuickReplyFlow({
                header: '🔢 Código de vinculación',
                body: `Código: ${pairing}`,
                footer: 'Toca "Copiar código"',
                buttons: [
                  { text: '📋 Copiar código', copy: pairing },
                  { text: '🤖 Mis Subbots', command: '/mybots' },
                  { text: '🧾 QR Subbot', command: '/qr' },
                  { text: '🏠 Menú', command: '/menu' },
                ],
              })
              resolve([
                { success:true, message:`✅ Código de vinculación\n\n🔢 Código: *${pairing}*\n📱 Número: +${phone}\n\nInstrucciones:\n1. WhatsApp > Dispositivos vinculados\n2. Vincular con número de teléfono\n3. Ingresa el código mostrado`, mentions: (phone ? [`${phone}@s.whatsapp.net`] : undefined), quoted: true, ephemeralDuration: 600 },
                { type: 'content', content: sendCopyableCode(pairing, '🔢 *CÓDIGO DE VINCULACIÓN*\n📱 Tu número: +' + phone + '\n\n⏱️ Válido por 5 minutos'), quoted: true, ephemeralDuration: 600 },
                { type: 'content', content: copyFlow, quoted: true, ephemeralDuration: 600 },
                { type: 'buttons', text: 'Acciones rápidas', footer: 'KONMI BOT', buttons: [ { text: '🤖 Mis Subbots', command: '/mybots' }, { text: '🧾 QR Subbot', command: '/qr' }, { text: '🏠 Menú', command: '/menu' } ], quoted: true, ephemeralDuration: 300 }
              ]);
            }
          }
        }]);
      } catch (e) {
        clearTimeout(timeout);
        resolve({ success:false, message:`⚠️ Error registrando listeners: ${e?.message||e}` });
      }
    });
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

    // Import the function to request pairing code for main bot
    const { requestMainBotPairingCode: requestCode } = await import('../whatsapp.js');

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

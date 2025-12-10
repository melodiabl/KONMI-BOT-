import { buildQuickReplyFlow } from '../utils/utils/flows.js'
import { sendCopyableCode, sendInteractiveButtons } from './ui-interactive.js'

import {
  generateSubbotPairingCode,
  generateSubbotQR,
  attachSubbotListeners,
  detachSubbotListeners,
} from '../lib/subbots.js';
import { getBotStatus } from '../../whatsapp.js';

// 🔧 NUEVO: Importar directamente desde inproc-subbots para registrar listener global
import { onSubbotEvent, offSubbotEvent } from '../services/inproc-subbots.js';

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
    
    const phone = await extractPhoneNumber(ctx);
    if (!phone) {
      const hint = Array.isArray(ctx?.args) && ctx.args.length ? 
        '❌ El número proporcionado no es válido. Debe tener 8-15 dígitos (formato internacional sin el +).' :
        '❌ No pude detectar tu número de WhatsApp. Por favor, proporciona tu número: /code <tu_numero>';
      return { success:false, message:hint }
    }

    // 🔧 CORRECCIÓN: Registrar listener GLOBAL antes de crear el subbot
    return await new Promise(async (resolve) => {
      let globalHandler = null;
      let codeValue = null;
      
      const timeout = setTimeout(() => {
        if (globalHandler) offSubbotEvent('pairing_code', globalHandler);
        resolve({ success:false, message:'⏱️ Timeout esperando código de vinculación (60s). Intenta de nuevo.' })
      }, 60000);

      // Registrar listener GLOBAL que captura todos los eventos pairing_code
      globalHandler = async (payload) => {
        try {
          const subbotCode = payload?.subbot?.code;
          
          // Solo procesar si es NUESTRO subbot
          if (!codeValue || subbotCode !== codeValue) return;

          // Limpiar timeout y listener
          clearTimeout(timeout);
          if (globalHandler) offSubbotEvent('pairing_code', globalHandler);
          
          const data = payload?.data || {};
          const pairingCode = data.pairingCode || data.code;
          
          console.log(`[pairing.js] 🎯 Código recibido para ${codeValue}: ${pairingCode}`);
          
          if (!pairingCode) {
            resolve({ success:false, message:'⚠️ No se recibió código de vinculación' });
            return;
          }

          // Registrar listener para cuando se conecte (notificación post-vinculación)
          try {
            const dmJid = phone ? `${phone}@s.whatsapp.net` : (remoteJid || null)
            if (sock && dmJid) {
              const onConnected = async (connPayload) => {
                try {
                  if (connPayload?.subbot?.code !== codeValue) return;
                  
                  const connData = connPayload?.data || {}
                  const linked = String(connData?.digits || connData?.number || connData?.jid || '').replace(/\D/g,'')
                  const parts = [
                    '🎉 Listo, ¡ya eres un subbot más de la comunidad!\n',
                    `🆔 SubBot: ${codeValue}`,
                    linked ? `🤝 Vinculado: +${linked}` : null,
                  ].filter(Boolean)
                  await sock.sendMessage(dmJid, { text: parts.join('\n') })
                  
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
                  }
                } finally {
                  offSubbotEvent('connected', onConnected);
                }
              }
              onSubbotEvent('connected', onConnected)
            }
          } catch (e) {
            console.error('[pairing.js] Error registrando onConnected:', e);
          }

          // Preparar respuestas con el código REAL
          const primary = {
            success: true,
            message: `✅ Código de vinculación\n\n🔢 Código: *${pairingCode}*\n📱 Número: +${phone}\n\nInstrucciones:\n1. WhatsApp > Dispositivos vinculados\n2. Vincular con número de teléfono\n3. Ingresa el código mostrado`,
            mentions: (phone ? [`${phone}@s.whatsapp.net`] : undefined),
            quoted: true,
            ephemeralDuration: 600,
          };

          const copyContent = { 
            type: 'content', 
            content: sendCopyableCode(pairingCode, '🔢 *CÓDIGO DE VINCULACIÓN*\n📱 Tu número: +' + phone + '\n\n⏱️ Válido por 5 minutos'), 
            quoted: true, 
            ephemeralDuration: 600 
          };

          const quickFlow = buildQuickReplyFlow({
            header: '🔢 Código de vinculación',
            body: `Código: ${pairingCode}`,
            footer: 'Toca "Copiar código"',
            buttons: [
              { text: '📋 Copiar código', command: '/copy ' + pairingCode },
              { text: '🤖 Mis Subbots', command: '/mybots' },
              { text: '🧾 QR Subbot', command: '/qr' },
              { text: '🏠 Menú', command: '/menu' },
            ],
          });
          const quickContent = { type: 'content', content: quickFlow, quoted: true, ephemeralDuration: 600 };

          resolve([primary, copyContent, quickContent]);
        } catch (e) {
          console.error('[pairing.js] Error en globalHandler:', e);
          resolve({ success:false, message:`⚠️ Error procesando código: ${e?.message||e}` });
        }
      };

      try {
        // 1. Registrar listener PRIMERO
        onSubbotEvent('pairing_code', globalHandler);
        console.log('[pairing.js] 📡 Listener global registrado para pairing_code');
        
        // 2. DESPUÉS crear el subbot
        const res = await generateSubbotPairingCode(phone, phone, { displayName: 'KONMI-BOT' });
        codeValue = res?.code;
        
        console.log(`[pairing.js] 🚀 Subbot creado con código: ${codeValue}`);
        
        if (!codeValue) {
          clearTimeout(timeout);
          if (globalHandler) offSubbotEvent('pairing_code', globalHandler);
          resolve({ success:false, message:'❌ Error al crear el subbot' });
        }
      } catch (e) {
        clearTimeout(timeout);
        if (globalHandler) offSubbotEvent('pairing_code', globalHandler);
        resolve({ success:false, message:`⚠️ Error generando code: ${e?.message||e}` });
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

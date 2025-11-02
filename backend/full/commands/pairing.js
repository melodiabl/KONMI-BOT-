// commands/pairing.js
// Pairing/QR para SubBots y main bot helpers

import {
  generateSubbotPairingCode,
  generateSubbotQR,
  attachSubbotListeners,
} from '../lib/subbots.js';

function onlyDigits(v) { return String(v||'').replace(/\D/g,''); }

// SubBot: generar QR y devolver imagen cuando esté lista
export async function qr({ message, usuario }) {
  try {
    const owner = onlyDigits(usuario);
    const res = await generateSubbotQR(owner, { displayName: 'KONMI-BOT' });
    const code = res?.code;
    if (!code) return { success:false, message:'❌ Error al crear el subbot QR' };
    return await new Promise((resolve) => {
      let detach = null;
      const timeout = setTimeout(() => { try { detach?.() } catch {}; resolve({ success:false, message:'⏱️ Timeout esperando QR. Intenta de nuevo.' }) }, 30000);
      try {
        detach = attachSubbotListeners(code, [{
          event: 'qr_ready',
          handler: (payload) => {
            try { clearTimeout(timeout); detach?.() } catch {}
            const data = payload?.data || payload;
            if (data?.qrImage) {
              resolve({ success:true, type:'image', image:{ url: data.qrImage }, caption:`🆔 SubBot: ${code}` });
            } else {
              resolve({ success:false, message:'⚠️ QR no disponible' });
            }
          }
        }]);
      } catch (e) {
        clearTimeout(timeout);
        resolve({ success:false, message:`⚠️ Error registrando listeners: ${e?.message||e}` });
      }
    });
  } catch (e) {
    return { success:false, message:`⚠️ Error generando QR: ${e?.message||e}` };
  }
}

// SubBot: Pairing code (para el número del usuario)
export async function code({ usuario }) {
  try {
    const phone = onlyDigits(usuario);
    if (!phone || phone.length < 8) return { success:true, message:'❌ Número inválido. Debe tener al menos 8 dígitos.' };
    const res = await generateSubbotPairingCode(phone, phone, { displayName: 'KONMI-BOT' });
    const code = res?.code;
    if (!code) return { success:false, message:'❌ Error al crear el subbot' };
    return await new Promise((resolve) => {
      let detach = null;
      const timeout = setTimeout(() => { try { detach?.() } catch {}; resolve({ success:false, message:'⏱️ Timeout esperando código. Intenta nuevamente.' }) }, 30000);
      try {
        detach = attachSubbotListeners(code, [{
          event: 'pairing_code',
          handler: (payload) => {
            const data = payload?.data || payload;
            const pairing = data?.pairingCode || data?.code;
            if (pairing) {
              try { clearTimeout(timeout); detach?.() } catch {}
              resolve({ success:true, message:`✅ Código de vinculación\n\n🔢 Código: *${pairing}*\n📱 Número: +${phone}\n\nInstrucciones:\n1. WhatsApp > Dispositivos vinculados\n2. Vincular con número de teléfono\n3. Ingresa el código mostrado` });
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

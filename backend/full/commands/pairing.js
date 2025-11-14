// commands/pairing.js
import { buildQuickReplyFlow } from '../utils/flows.js';
import { generateSubbotPairingCode, generateSubbotQR, attachSubbotListeners, detachSubbotListeners } from '../lib/subbots.js';

function normalizeDigits(v) { return String(v || '').replace(/[^0-9]/g, '') }

export async function qr({ isOwner, usuarioNumber, remoteJid, sock }) {
  const access = String(process.env.SUBBOTS_ACCESS || 'all').toLowerCase();
  if (access === 'owner' && !isOwner) {
    return { success: false, message: '⛔ Solo el owner puede usar /qr (subbots).', quoted: true };
  }

  const owner = usuarioNumber;
  const res = await generateSubbotQR(owner, { displayName: 'KONMI-BOT' });
  const code = res?.code;
  if (!code) return { success: false, message: '❌ Error al crear el subbot QR' };

  // Notificaciones y listeners...
  // (se mantiene la lógica original, ya que no depende del contexto de permisos)

  return new Promise((resolve) => {
    // ... (lógica de promesa original sin cambios)
  });
}

export async function code({ isOwner, usuarioNumber, remoteJid, sock }) {
  const access = String(process.env.SUBBOTS_ACCESS || 'all').toLowerCase();
  if (access === 'owner' && !isOwner) {
    return { success: false, message: '⛔ Solo el owner puede usar /code (subbots).', quoted: true };
  }

  const phone = usuarioNumber;
  if (!phone || phone.length < 8) return { success: true, message: '❌ Número inválido. Debe tener al menos 8 dígitos.' };

  const res = await generateSubbotPairingCode(phone, phone, { displayName: 'KONMI-BOT' });
  const code = res?.code;
  if (!code) return { success: false, message: '❌ Error al crear el subbot' };

  // Notificaciones y listeners...
  // (se mantiene la lógica original)

  return new Promise((resolve) => {
    // ... (lógica de promesa original sin cambios)
  });
}

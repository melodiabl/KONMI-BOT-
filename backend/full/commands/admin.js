// commands/admin.js
import { getTheme } from '../utils/theme.js';
import { setPrimaryOwner } from '../global-config.js';

function requireOwner(handler) {
  return async (ctx) => {
    if (!ctx.isOwner) {
      return { success: true, message: '⛔ Este comando solo puede ser usado por el owner del bot.', quoted: true };
    }
    return handler(ctx);
  };
}

export async function ownerInfo({ isOwner, usuarioNumber }) {
  const th = getTheme();
  const roles = isOwner ? ['owner'] : [];
  const msg = `${th.header('TU PERFIL')}\n👤 +${usuarioNumber}\n🔖 Roles: ${roles.join(', ') || 'ninguno'}\n${th.footer()}`;
  return { success: true, message: msg, quoted: true };
}

export async function checkOwner({ isOwner }) {
  return { success: true, message: isOwner ? '✅ Tienes rol de owner' : '⛔ No eres owner', quoted: true };
}

export const setOwner = requireOwner(async ({ args }) => {
  const numero = String(args?.[0] || '').replace(/\D/g, '');
  const nombre = args?.slice(1).join(' ') || 'Owner';
  if (!numero) {
    return { success: true, message: 'ℹ️ Uso: /setowner <numero> <nombre>', quoted: true };
  }
  setPrimaryOwner(numero, nombre);
  return { success: true, message: `✅ Owner principal configurado: ${nombre} (+${numero})`, quoted: true };
});

export async function debugMe({ isOwner, usuarioNumber }) {
  return { success: true, message: `👤 +${usuarioNumber}\n🔖 Roles: ${isOwner ? 'owner' : 'ninguno'}`, quoted: true };
}

export async function debugFull(ctx) {
  return ownerInfo(ctx);
}

export async function testAdmin({ isOwner }) {
  return { success: true, message: isOwner ? '✅ Admin OK' : '⛔ No admin', quoted: true };
}

export async function debugBot({ sock, remoteJid, usuarioNumber, isGroup, isBotAdmin, isOwner }) {
  try {
    const th = getTheme();
    const botNumber = String(sock?.user?.id || '').replace(/\D/g, '');
    const envOwner = String(process.env.OWNER_WHATSAPP_NUMBER || '').replace(/\D/g, '');
    const roles = isOwner ? ['owner'] : [];

    const body = [
      `🤖 Debug Bot`,
      `• Bot JID: ${sock?.user?.id || '(n/a)'}`,
      `• Número Base: +${botNumber || '(n/a)'}`,
      `• Owner (env): +${envOwner || '(n/a)'}`,
      `• Tú: +${usuarioNumber} ${roles.length ? `(${roles.join(', ')})` : ''}`,
      isGroup ? `• Bot Admin en grupo: ${isBotAdmin ? 'Sí' : 'No'}` : null,
    ].filter(Boolean).join('\n');

    const msg = `${th.header('KONMI BOT')}\n${body}\n${th.footer()}`;
    return { success: true, message: msg, quoted: true };
  } catch (e) {
    return { success: false, message: `⚠️ Error en /debugbot: ${e?.message || e}`, quoted: true };
  }
}

export default { ownerInfo, checkOwner, setOwner, debugMe, debugFull, testAdmin, debugBot };

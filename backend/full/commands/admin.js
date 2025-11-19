// commands/admin.js
// Refactorizado para usar el objeto de contexto (ctx) unificado y permisos centralizados.

import { getTheme } from '../utils/theme.js';
import { setPrimaryOwner } from '../global-config.js';

export async function ownerInfo(ctx) {
  const th = getTheme();
  const roles = ctx.isOwner ? ['owner'] : [];
  const msg = `${th.header('TU PERFIL')}\n👤 +${ctx.usuarioNumber}\n🔖 Roles: ${roles.join(', ') || 'ninguno'}\n${th.footer()}`;
  return { success: true, message: msg };
}

export async function checkOwner(ctx) {
  if (!ctx.isOwner) {
    return { success: false, message: '⛔ No tienes el rol de owner.' };
  }
  return { success: true, message: '✅ Tienes el rol de owner.' };
}

export async function setOwner(ctx) {
  if (!ctx.isOwner) {
    return { success: false, message: '⛔ Este comando solo puede ser usado por el owner del bot.' };
  }

  const numero = String(ctx.args?.[0] || '').replace(/\D/g, '');
  const nombre = ctx.args?.slice(1).join(' ') || 'Owner';

  if (!numero) {
    return { success: false, message: 'ℹ️ Uso: /setowner <número> <nombre>' };
  }

  setPrimaryOwner(numero, nombre);
  return { success: true, message: `✅ Owner principal configurado: ${nombre} (+${numero})` };
}

export async function debugBot(ctx) {
  try {
    const th = getTheme();
    const botNumber = String(ctx.sock?.user?.id || '').replace(/\D/g, '');
    const envOwner = String(process.env.OWNER_WHATSAPP_NUMBER || '').replace(/\D/g, '');
    const roles = ctx.isOwner ? ['owner'] : [];
    const userAdmin = ctx.isAdmin ? 'admin del grupo' : 'miembro';

    const body = [
      `🤖 Debug del Bot`,
      `• Bot JID: ${ctx.sock?.user?.id || '(n/a)'}`,
      `• Número Base: +${botNumber || '(n/a)'}`,
      `• Owner (env): +${envOwner || '(n/a)'}`,
      `• Tú: +${ctx.usuarioNumber} ${roles.length ? `(${roles.join(', ')})` : ''}`,
      `• Tu estatus: ${userAdmin}`,
      ctx.isGroup ? `• Bot Admin en grupo: ${ctx.isBotAdmin ? '✅ Sí' : '❌ No'}` : null,
      ctx.isGroup ? `• Grupo metadata disponible: ${ctx.groupMetadata ? '✅ Sí' : '❌ No'}` : null,
    ].filter(Boolean).join('\n');

    const msg = `${th.header('KONMI BOT')}\n${body}\n${th.footer()}`;
    return { success: true, message: msg };
  } catch (e) {
    return { success: false, message: `⚠️ Error en /debugbot: ${e?.message || e}` };
  }
}

// Alias y otros comandos de debug
export const testAdmin = checkOwner;
export const debugMe = ownerInfo;
export const debugFull = ownerInfo;

export default { ownerInfo, checkOwner, setOwner, debugBot, testAdmin, debugMe, debugFull };

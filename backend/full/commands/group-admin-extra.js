const requireGroupAdmin = (handler) => async (ctx) => {
  if (!ctx.isGroup) return { message: 'ℹ️ Este comando solo funciona en grupos' };
  if (!ctx.isAdmin && !ctx.isOwner) return { message: '⛔ Solo admins o el owner pueden usar este comando' };
  if (!ctx.isBotAdmin) return { message: '⛔ El bot necesita ser administrador para realizar esta acción' };
  return handler(ctx);
};

export const muteall = requireGroupAdmin(async ({ sock, remoteJid, args }) => {
  const on = String(args[0] || '').toLowerCase();
  if (!['on', 'off'].includes(on)) return { message: 'ℹ️ Uso: /muteall on|off' };
  await sock.groupSettingUpdate(remoteJid, 'announcement', on === 'on');
  return { message: `🔇 Solo admins pueden enviar mensajes: ${on === 'on' ? 'ON' : 'OFF'}` };
});

export const lockinfo = requireGroupAdmin(async ({ sock, remoteJid, args }) => {
  const on = String(args[0] || '').toLowerCase();
  if (!['on', 'off'].includes(on)) return { message: 'ℹ️ Uso: /lockinfo on|off' };
  await sock.groupSettingUpdate(remoteJid, 'locked', on === 'on');
  return { message: `🔒 Solo admins pueden editar info: ${on === 'on' ? 'ON' : 'OFF'}` };
});

export const subject = requireGroupAdmin(async ({ sock, remoteJid, args }) => {
  const text = args.join(' ').trim();
  if (!text) return { message: 'ℹ️ Uso: /subject [nuevo título]' };
  await sock.groupUpdateSubject(remoteJid, text);
  return { message: '✅ Título actualizado' };
});

export const desc = requireGroupAdmin(async ({ sock, remoteJid, args }) => {
  const text = args.join(' ').trim();
  if (!text) return { message: 'ℹ️ Uso: /desc [nueva descripción]' };
  await sock.groupUpdateDescription(remoteJid, text);
  return { message: '✅ Descripción actualizada' };
});

export const invite = requireGroupAdmin(async ({ sock, remoteJid }) => {
  const code = await sock.groupInviteCode(remoteJid);
  return { message: `🔗 Invitación: https://chat.whatsapp.com/${code}` };
});

export default { muteall, lockinfo, subject, desc, invite }




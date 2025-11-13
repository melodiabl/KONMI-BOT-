import db from '../db.js';

const requireGroupAdmin = (handler) => async (ctx) => {
  if (!ctx.isGroup) return { message: 'ℹ️ Este comando solo funciona en grupos.' };
  if (!ctx.isAdmin && !ctx.isOwner) return { message: '⛔ Solo admins o el owner pueden usar este comando.' };
  return handler(ctx);
};

const onlyDigits = (v) => String(v || '').replace(/\D/g, '');

const getTargetJid = (message, args) => {
  const xt = message?.message?.extendedTextMessage;
  const ctx = xt?.contextInfo;
  if (ctx?.mentionedJid?.[0]) return ctx.mentionedJid[0];
  if (ctx?.quotedMessage && ctx?.participant) return ctx.participant;
  const digits = onlyDigits(args.join(' '));
  return digits ? `${digits}@s.whatsapp.net` : null;
};

export const warn = requireGroupAdmin(async (ctx) => {
  const { remoteJid, args, message } = ctx;
  const target = getTargetJid(message, args);
  if (!target) return { message: 'ℹ️ Uso: /warn @usuario | responder a un mensaje' };

  const user = onlyDigits(target);
  const row = await db('group_warnings').where({ group_id: remoteJid, user }).first();
  const count = (row?.count || 0) + 1;

  await db('group_warnings').insert({ group_id: remoteJid, user, count }).onConflict(['group_id', 'user']).merge();

  return { message: `⚠️ Advertencia para @${user}. Total: ${count}`, mentions: [target] };
});

export const unwarn = requireGroupAdmin(async (ctx) => {
  const { remoteJid, args } = ctx;
  const user = onlyDigits(args[0] || '');
  if (!user) return { message: 'ℹ️ Uso: /unwarn <numero_sin_+>' };

  await db('group_warnings').where({ group_id: remoteJid, user }).del();
  return { message: `♻️ Advertencias reseteadas para +${user}` };
});

export const warns = requireGroupAdmin(async (ctx) => {
  const { remoteJid } = ctx;
  const rows = await db('group_warnings').where({ group_id: remoteJid }).orderBy('count', 'desc').limit(15);
  if (!rows.length) return { message: 'ℹ️ No hay advertencias registradas.' };

  const list = rows.map((r, i) => `${i + 1}. +${r.user} — ${r.count}`).join('\n');
  return { message: `📋 Advertencias (top 15)\n\n${list}` };
});

export default { warn, unwarn, warns }


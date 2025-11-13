// commands/groups.js
import db from '../db.js'
import { getTheme } from '../utils/theme.js'
import { buildQuickReplyFlow } from '../utils/flows.js'

const onlyDigits = (v) => String(v || '').replace(/\D/g, '')

async function ensureGroupsTable() {
  if (await db.schema.hasTable('grupos_autorizados')) return;
  await db.schema.createTable('grupos_autorizados', (t) => {
    t.increments('id')
    t.string('jid').unique().notNullable()
    t.boolean('bot_enabled').defaultTo(true)
    t.string('tipo').nullable()
    t.timestamp('updated_at').defaultTo(db.fn.now())
  });
}

const getTargetJid = (message, args) => {
  const xt = message?.message?.extendedTextMessage;
  const ctx = xt?.contextInfo;
  if (ctx?.mentionedJid?.[0]) return ctx.mentionedJid[0];
  if (ctx?.quotedMessage && ctx?.participant) return ctx.participant;
  const digits = onlyDigits(args.join(' '));
  return digits ? `${digits}@s.whatsapp.net` : null;
};

const requireGroup = (ctx) => {
  if (!ctx.isGroup) throw new Error('Este comando solo funciona en grupos');
};
const requireAdmin = (ctx) => {
  if (!ctx.isOwner && !ctx.isAdmin) throw new Error('Solo admins o el owner pueden usar este comando');
};
const requireBotAdmin = (ctx) => {
  if (!ctx.isBotAdmin) throw new Error('El bot necesita ser administrador para realizar esta acción');
};

export async function addGroup(ctx) {
  requireGroup(ctx);
  requireAdmin(ctx);
  await ensureGroupsTable();
  const { remoteJid } = ctx;
  const row = await db('grupos_autorizados').where({ jid: remoteJid }).first();
  if (row) await db('grupos_autorizados').where({ jid: remoteJid }).update({ bot_enabled: true, updated_at: new Date().toISOString() });
  else await db('grupos_autorizados').insert({ jid: remoteJid, bot_enabled: true, tipo: 'general' });
  return { success: true, type: 'buttons', text: '✅ Grupo agregado y bot habilitado', footer: 'KONMI BOT', buttons: [{ text: '⚙️ /bot on' }, { text: '⛔ /bot off' }, { text: '📋 Ayuda' }] };
}

export async function delGroup(ctx) {
  requireGroup(ctx);
  requireAdmin(ctx);
  await ensureGroupsTable();
  await db('grupos_autorizados').where({ jid: ctx.remoteJid }).update({ bot_enabled: false, updated_at: new Date().toISOString() });
  return { success: true, message: '🛑 Bot deshabilitado en este grupo' };
}

export async function kick(ctx) {
  requireGroup(ctx);
  requireAdmin(ctx);
  requireBotAdmin(ctx);
  const { remoteJid, args, sock, message, usuario } = ctx;
  const targetJid = getTargetJid(message, args);
  if (!targetJid) return { message: 'ℹ️ Uso: /kick @usuario | responder a un mensaje | /kick <numero>' };
  await sock.groupParticipantsUpdate(remoteJid, [targetJid], 'remove');
  const targetNum = onlyDigits(targetJid);
  const actorNum = onlyDigits(usuario);
  return { success: true, message: `👢 Usuario expulsado\n\n• Objetivo: @${targetNum}\n• Hecho por: @${actorNum}`, mentions: [targetJid, usuario] };
}

export async function promote(ctx) {
  requireGroup(ctx);
  requireAdmin(ctx);
  requireBotAdmin(ctx);
  const { remoteJid, args, sock, message, usuario } = ctx;
  const targetJid = getTargetJid(message, args);
  if (!targetJid) return { message: 'ℹ️ Uso: /promote @usuario | responder a un mensaje | /promote <numero>' };
  const targetNum = onlyDigits(targetJid);
  if (args[0] !== 'confirm') {
    return { type: 'content', content: buildQuickReplyFlow({ header: '⚠️ Confirmar promoción', body: `Usuario: @${targetNum}`, buttons: [{ text: '✅ Confirmar', command: `/promote confirm ${targetNum}` }, { text: '❌ Cancelar' }] }) };
  }
  await sock.groupParticipantsUpdate(remoteJid, [targetJid], 'promote');
  const actorNum = onlyDigits(usuario);
  return { success: true, message: `✅ Usuario promovido\n\n• Objetivo: @${targetNum}\n• Hecho por: @${actorNum}`, mentions: [targetJid, usuario] };
}

export async function demote(ctx) {
  requireGroup(ctx);
  requireAdmin(ctx);
  requireBotAdmin(ctx);
  const { remoteJid, args, sock, message, usuario } = ctx;
  const targetJid = getTargetJid(message, args);
  if (!targetJid) return { message: 'ℹ️ Uso: /demote @usuario | responder a un mensaje | /demote <numero>' };
  const targetNum = onlyDigits(targetJid);
  if (args[0] !== 'confirm') {
    return { type: 'content', content: buildQuickReplyFlow({ header: '⚠️ Confirmar degradar', body: `Usuario: @${targetNum}`, buttons: [{ text: '✅ Confirmar', command: `/demote confirm ${targetNum}` }, { text: '❌ Cancelar' }] }) };
  }
  await sock.groupParticipantsUpdate(remoteJid, [targetJid], 'demote');
  const actorNum = onlyDigits(usuario);
  return { success: true, message: `🪣 Usuario degradado\n\n• Objetivo: @${targetNum}\n• Hecho por: @${actorNum}`, mentions: [targetJid, usuario] };
}

export async function lock(ctx) {
  requireGroup(ctx);
  requireAdmin(ctx);
  requireBotAdmin(ctx);
  if (ctx.args[0] !== 'confirm') {
    return { type: 'content', content: buildQuickReplyFlow({ header: '🔒 Confirmar bloqueo', body: '¿Estás seguro de que quieres bloquear el grupo?', buttons: [{ text: '✅ Confirmar', command: '/lock confirm' }, { text: '❌ Cancelar' }] }) };
  }
  await ctx.sock.groupSettingUpdate(ctx.remoteJid, 'announcement');
  return { success: true, message: '🔒 Grupo bloqueado' };
}

export async function unlock(ctx) {
  requireGroup(ctx);
  requireAdmin(ctx);
  requireBotAdmin(ctx);
  if (ctx.args[0] !== 'confirm') {
    return { type: 'content', content: buildQuickReplyFlow({ header: '🔓 Confirmar desbloqueo', body: '¿Estás seguro de que quieres desbloquear el grupo?', buttons: [{ text: '✅ Confirmar', command: '/unlock confirm' }, { text: '❌ Cancelar' }] }) };
  }
  await ctx.sock.groupSettingUpdate(ctx.remoteJid, 'not_announcement');
  return { success: true, message: '🔓 Grupo desbloqueado' };
}

export async function tag(ctx) {
  requireGroup(ctx);
  const { message, remoteJid, sock, args } = ctx;
  const md = await sock.groupMetadata(remoteJid);
  const all = md.participants.map(p => p.id);
  const targetJids = [
    ...(message?.message?.extendedTextMessage?.contextInfo?.mentionedJid || []),
    (message?.message?.extendedTextMessage?.contextInfo?.quotedMessage ? message?.message?.extendedTextMessage?.contextInfo?.participant : null),
    ...args.map(a => `${onlyDigits(a)}@s.whatsapp.net`).filter(j => j.includes('@'))
  ].filter(Boolean);
  const mentions = targetJids.length ? [...new Set(targetJids)] : all;
  const text = (message?.message?.conversation || message?.message?.extendedTextMessage?.text || '').trim() || `🔔 ${mentions.length} mencionados`;
  return { success: true, message: text, mentions };
}

export function whoami(ctx) {
  const th = getTheme();
  const { usuario, remoteJid, isGroup, isOwner, isAdmin } = ctx;
  const roles = [isOwner && 'Owner', isAdmin && 'Admin'].filter(Boolean).join(', ');
  const body = [
    `👤 ${usuario.split('@')[0]}`,
    isGroup ? `👥 Grupo: ${remoteJid}` : '💬 Privado',
    roles && `🔖 Roles: ${roles}`
  ].filter(Boolean).join('\n');
  return { message: `${th.header('TU PERFIL')}\n${body}\n${th.footer()}` };
}

export function debugadmin({ isAdmin }) {
  return { message: isAdmin ? '✅ Tienes permisos de admin en este grupo' : '⛔ No tienes permisos de admin' };
}

export async function admins({ remoteJid, sock }) {
  const th = getTheme();
  const md = await sock.groupMetadata(remoteJid);
  const admins = md.participants.filter(p => p.admin);
  if (!admins.length) return { message: 'ℹ️ No hay administradores en este grupo.' };
  const list = admins.map((a, i) => `${i + 1}. @${a.id.split('@')[0]}`).join('\n');
  return { message: `${th.header('ADMINISTRADORES')}\n${list}\n${th.footer()}`, mentions: admins.map(a => a.id) };
}

export function debuggroup(ctx) {
  const th = getTheme();
  const { usuario, isAdmin, isBotAdmin, sock } = ctx;
  const meDigits = onlyDigits(usuario);
  const botDigits = onlyDigits(sock.user.id);
  const body = [
    '🧪 Debug del grupo',
    `• Tú: +${meDigits} | admin=${isAdmin}`,
    `• Bot: +${botDigits} | admin=${isBotAdmin}`,
  ].join('\n');
  return { message: `${th.header('DEBUG GRUPO')}\n${body}\n${th.footer()}` };
}







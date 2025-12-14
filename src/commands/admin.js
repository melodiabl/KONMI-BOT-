// src/commands/admin.js

import { getTheme } from '../utils/utils/theme.js'
import { setPrimaryOwner } from '../config/global-config.js'
import { getGroupRoles, getGroupMetadataCached } from '../utils/utils/group-helper.js'

function normalizePhoneNumber(jidOrNumber) {
  if (!jidOrNumber) return null;
  let str = String(jidOrNumber);
  const atIndex = str.indexOf('@');
  if (atIndex > 0) str = str.slice(0, atIndex);
  const colonIndex = str.indexOf(':');
  if (colonIndex > 0) str = str.slice(0, colonIndex);
  return str.replace(/\D/g, '') || null;
}

async function ownerInfo(ctx) {
  const th = getTheme();
  const userNumber = normalizePhoneNumber(ctx.sender || ctx.usuario || ctx.senderNumber);
  const roles = ctx.isOwner ? ['owner'] : [];
  const msg = [
    th.header('TU PERFIL'),
    `📱 Número: +${userNumber || 'desconocido'}`,
    `👑 Roles: ${roles.join(', ') || 'ninguno'}`,
    th.footer()
  ].join('\n');
  return { text: msg };
}

async function setOwner(ctx) {
  if (!ctx.isOwner) {
    return { text: 'Este comando solo puede ser usado por el owner del bot.' };
  }
  const numero = normalizePhoneNumber(ctx.args?.[0]);
  const nombre = ctx.args?.slice(1).join(' ') || 'Owner';
  if (!numero) {
    return { text: '❌ Uso: /setowner <número> <nombre>' };
  }
  setPrimaryOwner(numero, nombre);
  return { text: `✅ Owner principal configurado: ${nombre} (+${numero})` };
}

async function debugBot(ctx) {
    const th = getTheme()
    const botJidRaw = ctx.sock?.user?.id || ctx.botJid || 'N/A'
    const botNumber = normalizePhoneNumber(botJidRaw)
    const envOwner = normalizePhoneNumber(process.env.OWNER_WHATSAPP_NUMBER)
    const userNumber = normalizePhoneNumber(ctx.sender || ctx.usuario || ctx.senderNumber)
    const rolesOwner = ctx.isOwner ? ['owner'] : []
    let isAdmin = !!ctx.isAdmin
    let isBotAdmin = !!ctx.isBotAdmin
    if (ctx.isGroup && ctx.sock && ctx.remoteJid) {
      try {
        const roles = await getGroupRoles(ctx.sock, ctx.remoteJid, ctx.sender)
        isAdmin = roles.isAdmin
        isBotAdmin = roles.isBotAdmin
      } catch (e) { console.error('Error obteniendo metadata:', e) }
    }
    const userAdmin = isAdmin ? 'admin del grupo' : 'miembro'
    const body = [
      `*Bot:*`,
      `📱 JID completo: ${botJidRaw}`,
      `🔢 Número limpio: +${botNumber || 'N/A'}`,
      `*Owner configurado:*`,
      `👑 En .env: +${envOwner || 'no configurado'}`,
      `*Tu información:*`,
      `📱 Tu número: +${userNumber || 'desconocido'}`,
      `🎭 Roles: ${rolesOwner.length ? rolesOwner.join(', ') : 'usuario normal'}`,
      `${ctx.isGroup ? `🛡️ Estatus en grupo: ${userAdmin}` : ''}`,
      ctx.isGroup ? `*Bot en este grupo:*` : '',
      ctx.isGroup ? `🤖 Es admin: ${isBotAdmin ? 'Sí ✅' : 'No ❌'}` : '',
    ].filter(Boolean).join('\n')
    const msg = `${th.header('KONMI BOT DEBUG')}\n${body}\n${th.footer()}`
    return { text: msg }
}

async function debugGroup(ctx) {
  const { sock, remoteJid, sender, isOwner, isGroup } = ctx;
  if (!isGroup) {
    return { text: 'ℹ️ Este comando solo funciona en grupos.' };
  }
  try {
    const th = getTheme();
    const metadata = await getGroupMetadataCached(sock, remoteJid);
    const participants = metadata?.participants || [];
    const admins = participants.filter(p => p.admin === 'admin' || p.admin === 'superadmin');
    const userRoles = await getGroupRoles(sock, remoteJid, sender);
    const botJid = normalizePhoneNumber(sock?.user?.id) + '@s.whatsapp.net';
    const botRoles = await getGroupRoles(sock, remoteJid, botJid);
    const body = [
        `*Grupo:* ${metadata?.subject || 'Sin nombre'}`,
        `*ID:* ${remoteJid}`,
        `*Miembros:* ${participants.length}`,
        `*Admins:* ${admins.length}`,
        `*Tu Rol:* ${userRoles.isAdmin ? 'Admin' : 'Miembro'}`,
        `*Rol del Bot:* ${botRoles.isBotAdmin ? 'Admin' : 'Miembro'}`,
    ].join('\n');
    return { text: `${th.header('DEBUG DE GRUPO')}\n${body}\n${th.footer()}` };
  } catch (e) {
      console.error('Error en /debuggroup:', e);
      return { text: `⚠️ Error en /debuggroup: ${e?.message || e}` };
  }
}

async function statusCheck(ctx) {
    const th = getTheme();
    const isConnected = !!ctx.sock && !!ctx.sock.user;
    const botNumber = normalizePhoneNumber(ctx.sock?.user?.id);
    const body = [
        `*Conexión:* ${isConnected ? '🟢 Conectado' : '🔴 Desconectado'}`,
        `*Número del Bot:* +${botNumber || 'N/A'}`
    ].join('\n');
    return { text: `${th.header('STATUS')}\n${body}\n${th.footer()}` };
}

export default [
  { name: 'ownerinfo', description: 'Muestra información sobre el propietario.', category: 'admin', handler: ownerInfo },
  { name: 'setowner', description: 'Establece el propietario principal del bot.', category: 'admin', handler: setOwner },
  { name: 'debug', description: 'Muestra información de depuración del bot.', category: 'admin', handler: debugBot },
  { name: 'debuggroup', description: 'Muestra información de depuración del grupo.', category: 'admin', handler: debugGroup },
  { name: 'status', description: 'Verifica el estado del bot.', category: 'admin', handler: statusCheck }
];

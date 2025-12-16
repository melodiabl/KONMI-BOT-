// commands/admin.js
// Debug y utilidades de owner/admin usando ctx unificado y helper de metadata

import { getTheme } from './utils/utils/theme.js'
import { setPrimaryOwner } from './config/global-config.js'
import { getGroupRoles, getGroupMetadataCached } from './utils/utils/group-helper.js'

// ✅ Helper mejorado para normalizar números
function normalizePhoneNumber(jidOrNumber) {
  if (!jidOrNumber) return null

  let str = String(jidOrNumber)

  // Remover @s.whatsapp.net
  const atIndex = str.indexOf('@')
  if (atIndex > 0) {
    str = str.slice(0, atIndex)
  }

  // Remover :XX (como :45)
  const colonIndex = str.indexOf(':')
  if (colonIndex > 0) {
    str = str.slice(0, colonIndex)
  }

  // Quedarse solo con dígitos
  const digits = str.replace(/\D/g, '')

  return digits || null
}

export async function ownerInfo(ctx) {
  const th = getTheme()
  const userNumber = normalizePhoneNumber(ctx.sender || ctx.usuario || ctx.senderNumber)
  const roles = ctx.isOwner ? ['owner'] : []

  const msg = [
    th.header('TU PERFIL'),
    `📱 Número: +${userNumber || 'desconocido'}`,
    `👑 Roles: ${roles.join(', ') || 'ninguno'}`,
    th.footer()
  ].join('\n')

  return { success: true, message: msg }
}

export async function checkOwner(ctx) {
  if (!ctx.isOwner) {
    return { success: false, message: '❌ No tienes el rol de owner.' }
  }
  return { success: true, message: '✅ Tienes el rol de owner.' }
}

export async function setOwner(ctx) {
  if (!ctx.isOwner) {
    return { success: false, message: 'Este comando solo puede ser usado por el owner del bot.' }
  }

  const numero = normalizePhoneNumber(ctx.args?.[0])
  const nombre = ctx.args?.slice(1).join(' ') || 'Owner'

  if (!numero) {
    return { success: false, message: '❌ Uso: /setowner <número> <nombre>' }
  }

  setPrimaryOwner(numero, nombre)
  return { success: true, message: `✅ Owner principal configurado: ${nombre} (+${numero})` }
}

export async function debugBot(ctx) {
  try {
    const th = getTheme()

    // ✅ Normalizar todos los números correctamente
    const botJidRaw = ctx.sock?.user?.id || ctx.botJid || 'N/A'
    const botNumber = normalizePhoneNumber(botJidRaw)
    const envOwner = normalizePhoneNumber(process.env.OWNER_WHATSAPP_NUMBER)
    const userNumber = normalizePhoneNumber(ctx.sender || ctx.usuario || ctx.senderNumber)

    const rolesOwner = ctx.isOwner ? ['owner'] : []

    let isAdmin = !!ctx.isAdmin
    let isBotAdmin = !!ctx.isBotAdmin
    let hasGroupMetadata = !!ctx.groupMetadata

    // ✅ Si es grupo, obtener metadata REAL
    if (ctx.isGroup && ctx.sock && ctx.remoteJid) {
      try {
        const roles = await getGroupRoles(ctx.sock, ctx.remoteJid, ctx.sender)
        isAdmin = roles.isAdmin
        isBotAdmin = roles.isBotAdmin
        const meta = await getGroupMetadataCached(ctx.sock, ctx.remoteJid)
        hasGroupMetadata = !!meta
      } catch (e) {
        console.error('Error obteniendo metadata:', e)
      }
    }

    const userAdmin = isAdmin ? 'admin del grupo' : 'miembro'

    const body = [
      `🤖 Debug del Bot`,
      ``,
      `*Bot:*`,
      `📱 JID completo: ${botJidRaw}`,
      `🔢 Número limpio: +${botNumber || 'N/A'}`,
      ``,
      `*Owner configurado:*`,
      `👑 En .env: +${envOwner || 'no configurado'}`,
      ``,
      `*Tu información:*`,
      `📱 Tu número: +${userNumber || 'desconocido'}`,
      `🎭 Roles: ${rolesOwner.length ? rolesOwner.join(', ') : 'usuario normal'}`,
      `${ctx.isGroup ? `🛡️ Estatus en grupo: ${userAdmin}` : ''}`,
      ``,
      ctx.isGroup ? `*Bot en este grupo:*` : '',
      ctx.isGroup ? `🤖 Es admin: ${isBotAdmin ? 'Sí ✅' : 'No ❌'}` : '',
      ctx.isGroup ? `📊 Metadata disponible: ${hasGroupMetadata ? 'Sí ✅' : 'No ❌'}` : '',
    ]
      .filter(Boolean)
      .join('\n')

    const msg = `${th.header('KONMI BOT')}\n${body}\n${th.footer()}`
    return { success: true, message: msg }
  } catch (e) {
    return { success: false, message: `⚠️ Error en /debugbot: ${e?.message || e}` }
  }
}

// ✅ NUEVO: Debug completo de permisos en grupo
export async function debugGroup(ctx) {
  const { sock, remoteJid, sender, isOwner, isGroup } = ctx

  if (!isGroup) {
    return { success: false, message: 'ℹ️ Este comando solo funciona en grupos.' }
  }

  try {
    const th = getTheme()

    // Obtener metadata del grupo
    const metadata = await getGroupMetadataCached(sock, remoteJid)
    const participants = metadata?.participants || []
    const admins = participants.filter(p =>
      p.admin === 'admin' || p.admin === 'superadmin' || p.admin === 'owner'
    )

    // Obtener roles del usuario y bot
    const userRoles = await getGroupRoles(sock, remoteJid, sender)
    const botJid = normalizePhoneNumber(sock?.user?.id) + '@s.whatsapp.net'
    const botRoles = await getGroupRoles(sock, remoteJid, botJid)

    // Información del usuario que ejecuta el comando
    const userNumber = normalizePhoneNumber(sender)
    const userParticipant = participants.find(p =>
      normalizePhoneNumber(p.id) === userNumber
    )

    // Información del bot
    const botNumber = normalizePhoneNumber(sock?.user?.id)
    const botParticipant = participants.find(p =>
      normalizePhoneNumber(p.id) === botNumber
    )

    const body = [
      `🔍 Debug Completo del Grupo`,
      ``,
      `*Grupo:*`,
      `📛 Nombre: ${metadata?.subject || 'Sin nombre'}`,
      `🆔 ID: ${remoteJid}`,
      `👥 Miembros: ${participants.length}`,
      `👑 Admins: ${admins.length}`,
      ``,
      `*Tu información:*`,
      `📱 Número: +${userNumber}`,
      `🎭 JID: ${sender}`,
      `👑 Owner del bot: ${isOwner ? 'Sí ✅' : 'No ❌'}`,
      `🛡️ Admin del grupo: ${userRoles.isAdmin ? 'Sí ✅' : 'No ❌'}`,
      `📊 Admin role: ${userParticipant?.admin || 'member'}`,
      ``,
      `*Bot:*`,
      `📱 Número: +${botNumber}`,
      `🎭 JID: ${sock?.user?.id}`,
      `🤖 Admin del grupo: ${botRoles.isBotAdmin ? 'Sí ✅' : 'No ❌'}`,
      `📊 Admin role: ${botParticipant?.admin || 'member'}`,
      ``,
      `*Permisos verificados:*`,
      `${userRoles.isAdmin ? '✅' : '❌'} Puedes usar comandos de admin`,
      `${botRoles.isBotAdmin ? '✅' : '❌'} Bot puede ejecutar acciones de admin`,
      `${isOwner ? '✅' : '❌'} Tienes privilegios de owner global`,
    ].join('\n')

    const msg = `${th.header('DEBUG DE GRUPO')}\n${body}\n${th.footer()}`
    return { success: true, message: msg }
  } catch (e) {
    return {
      success: false,
      message: `⚠️ Error en /debuggroup: ${e?.message || e}`
    }
  }
}

// ✅ NUEVO: Verificar conexión y permisos básicos
export async function statusCheck(ctx) {
  const th = getTheme()
  const botNumber = normalizePhoneNumber(ctx.sock?.user?.id)
  const userNumber = normalizePhoneNumber(ctx.sender || ctx.usuario)
  const isConnected = !!ctx.sock && !!ctx.sock.user

  const body = [
    `📊 Estado del Bot`,
    ``,
    `*Conexión:*`,
    `${isConnected ? '🟢' : '🔴'} Estado: ${isConnected ? 'Conectado' : 'Desconectado'}`,
    `📱 Bot número: +${botNumber || 'N/A'}`,
    ``,
    `*Tu sesión:*`,
    `📱 Tu número: +${userNumber || 'desconocido'}`,
    `👑 Owner: ${ctx.isOwner ? 'Sí ✅' : 'No ❌'}`,
    ctx.isGroup ? `🛡️ Admin: ${ctx.isAdmin ? 'Sí ✅' : 'No ❌'}` : '',
    ``,
    `*Comandos disponibles:*`,
    `${ctx.isOwner || ctx.isAdmin ? '✅' : '❌'} Comandos de administración`,
    `${ctx.isOwner ? '✅' : '❌'} Comandos de owner`,
  ].filter(Boolean).join('\n')

  const msg = `${th.header('STATUS')}\n${body}\n${th.footer()}`
  return { success: true, message: msg }
}

// Alias y otros comandos de debug
export const testAdmin = checkOwner
export const debugMe = ownerInfo
export const debugFull = debugGroup

export default {
  ownerInfo,
  checkOwner,
  setOwner,
  debugBot,
  debugGroup,
  statusCheck,
  testAdmin,
  debugMe,
  debugFull
}

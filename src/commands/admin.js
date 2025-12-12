// commands/admin.js
// Debug y utilidades de owner/admin con logging mejorado y metadata real

import logger from '../config/logger.js'
import { getTheme } from '../utils/utils/theme.js'
import { setPrimaryOwner } from '../config/global-config.js'
import { getGroupRoles, getGroupMetadataCached } from '../utils/utils/group-helper.js'
import { successResponse, errorResponse, logCommandExecution, logCommandError, onlyDigits } from '../utils/command-helpers.js'

/**
 * Obtiene información del perfil del owner
 */
export async function ownerInfo(ctx) {
  try {
    const th = getTheme()
    const roles = ctx.isOwner ? ['owner'] : []
    const userNumber = ctx.usuarioNumber || 'desconocido'

    const msg = `${th.header('👤 TU PERFIL')}\n📱 Número: +${userNumber}\n🎭 Roles: ${roles.join(', ') || 'ninguno'}\n${th.footer()}`

    logCommandExecution('ownerinfo', ctx, true, { roles })
    return successResponse(msg, { metadata: { roles, userNumber } })
  } catch (e) {
    logCommandError('ownerinfo', ctx, e)
    return errorResponse('⚠️ Error al obtener información del perfil.', {
      command: 'ownerinfo',
      error: e.message,
    })
  }
}

/**
 * Verifica si el usuario es owner
 */
export async function checkOwner(ctx) {
  try {
    if (!ctx.isOwner) {
      logCommandExecution('checkowner', ctx, false, { reason: 'not_owner' })
      return errorResponse('❌ No tienes el rol de owner.', {
        command: 'checkowner',
        isOwner: false,
      })
    }

    logCommandExecution('checkowner', ctx, true)
    return successResponse('✅ Tienes el rol de owner.', {
      metadata: { isOwner: true },
    })
  } catch (e) {
    logCommandError('checkowner', ctx, e)
    return errorResponse('⚠️ Error al verificar rol de owner.', {
      command: 'checkowner',
      error: e.message,
    })
  }
}

/**
 * Establece el owner principal del bot
 */
export async function setOwner(ctx) {
  try {
    if (!ctx.isOwner) {
      logCommandExecution('setowner', ctx, false, { reason: 'not_owner' })
      return errorResponse('❌ Este comando solo puede ser usado por el owner del bot.', {
        command: 'setowner',
        reason: 'not_owner',
      })
    }

    const numero = onlyDigits(ctx.args?.[0] || '')
    const nombre = ctx.args?.slice(1).join(' ') || 'Owner'

    if (!numero || numero.length < 10) {
      logCommandExecution('setowner', ctx, false, { reason: 'invalid_number' })
      return errorResponse('❌ Uso: /setowner <número> <nombre>\n📝 El número debe tener al menos 10 dígitos.', {
        command: 'setowner',
        reason: 'invalid_number',
      })
    }

    setPrimaryOwner(numero, nombre)

    logger.info(
      {
        scope: 'command',
        command: 'setowner',
        user: (ctx.sender || '').split('@')[0],
        newOwner: numero,
        newOwnerName: nombre,
      },
      `🔑 Owner principal configurado: ${nombre} (+${numero})`
    )

    logCommandExecution('setowner', ctx, true, { newOwner: numero, newOwnerName: nombre })
    return successResponse(`✅ Owner principal configurado: ${nombre} (+${numero})`, {
      metadata: { newOwner: numero, newOwnerName: nombre },
    })
  } catch (e) {
    logCommandError('setowner', ctx, e)
    return errorResponse('⚠️ Error al configurar el owner.', {
      command: 'setowner',
      error: e.message,
    })
  }
}

/**
 * Información de debug del bot
 */
export async function debugBot(ctx) {
  try {
    const th = getTheme()
    const botNumber = onlyDigits(ctx.sock?.user?.id || '')
    const envOwner = onlyDigits(process.env.OWNER_WHATSAPP_NUMBER || '')
    const rolesOwner = ctx.isOwner ? ['owner'] : []

    let isAdmin = !!ctx.isAdmin
    let isBotAdmin = !!ctx.isBotAdmin
    let hasGroupMetadata = !!ctx.groupMetadata
    let groupInfo = null

    if (ctx.isGroup && ctx.sock && ctx.remoteJid && ctx.sender) {
      try {
        const roles = await getGroupRoles(ctx.sock, ctx.remoteJid, ctx.sender)
        isAdmin = roles.isAdmin
        isBotAdmin = roles.isBotAdmin

        const meta = await getGroupMetadataCached(ctx.sock, ctx.remoteJid)
        hasGroupMetadata = !!meta
        groupInfo = {
          id: meta?.id,
          subject: meta?.subject,
          participants: meta?.participants?.length || 0,
        }
      } catch (e) {
        logger.warn(
          { scope: 'command', command: 'debugbot', error: e.message },
          `⚠️ Error al obtener información del grupo: ${e.message}`
        )
      }
    }

    const userAdmin = isAdmin ? 'admin del grupo' : 'miembro'
    const botAdminStatus = isBotAdmin ? 'Sí ✅' : 'No ❌'
    const metadataStatus = hasGroupMetadata ? 'Sí ✅' : 'No ❌'

    const body = [
      `🤖 Debug del Bot`,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      `🔧 Bot JID: ${ctx.sock?.user?.id || '(n/a)'}`,
      `📱 Número Base: +${botNumber || '(n/a)'}`,
      `👑 Owner (env): +${envOwner || '(n/a)'}`,
      `👤 Tu Número: +${ctx.usuarioNumber || '(n/a)'}`,
      `🎭 Tus Roles: ${rolesOwner.length ? rolesOwner.join(', ') : 'ninguno'}`,
      `📊 Tu Estatus: ${userAdmin}`,
      ctx.isGroup ? `🛡️ Bot Admin en Grupo: ${botAdminStatus}` : null,
      ctx.isGroup ? `📋 Metadata Disponible: ${metadataStatus}` : null,
      ctx.isGroup && groupInfo ? `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━` : null,
      ctx.isGroup && groupInfo ? `📍 Grupo: ${groupInfo.subject || '(sin nombre)'}` : null,
      ctx.isGroup && groupInfo ? `👥 Miembros: ${groupInfo.participants}` : null,
    ]
      .filter(Boolean)
      .join('\n')

    const msg = `${th.header('🔍 KONMI BOT - DEBUG')}\n${body}\n${th.footer()}`

    const metadata = {
      botNumber,
      envOwner,
      isAdmin,
      isBotAdmin,
      hasGroupMetadata,
      ...(groupInfo && { groupInfo }),
    }

    logCommandExecution('debugbot', ctx, true, metadata)
    return successResponse(msg, { metadata })
  } catch (e) {
    logCommandError('debugbot', ctx, e)
    return errorResponse(`⚠️ Error en debug: ${e.message}`, {
      command: 'debugbot',
      error: e.message,
    })
  }
}

/**
 * Información del usuario actual
 */
export async function whoami(ctx) {
  try {
    const { sender, isGroup, botNumber, sock, remoteJid } = ctx
    const num = (sender || '').split('@')[0] || 'desconocido'

    let isAdmin = false
    let isBotAdmin = false
    let groupName = null

    if (isGroup && sock && remoteJid && sender) {
      try {
        const roles = await getGroupRoles(sock, remoteJid, sender)
        isAdmin = roles.isAdmin
        isBotAdmin = roles.isBotAdmin

        const meta = await getGroupMetadataCached(sock, remoteJid)
        groupName = meta?.subject || 'desconocido'
      } catch (e) {
        logger.warn(
          { scope: 'command', command: 'whoami', error: e.message },
          `⚠️ Error al obtener información del grupo: ${e.message}`
        )
      }
    }

    const lines = [
      `🙋‍♂️ Tu Número: +${num}`,
      `📍 Contexto: ${isGroup ? `Grupo (${groupName})` : 'Privado'}`,
      `🛡️ Admin: ${isAdmin ? 'Sí ✅' : 'No ❌'}`,
      `🤖 Bot Admin: ${isBotAdmin ? 'Sí ✅' : 'No ❌'}`,
      `🔧 Bot: +${botNumber || 'desconocido'}`,
    ]

    const metadata = {
      number: num,
      isGroup,
      isAdmin,
      isBotAdmin,
      botNumber,
      ...(groupName && { groupName }),
    }

    logCommandExecution('whoami', ctx, true, metadata)
    return successResponse(lines.join('\n'), { metadata })
  } catch (e) {
    logCommandError('whoami', ctx, e)
    return errorResponse('⚠️ Error al obtener información.', {
      command: 'whoami',
      error: e.message,
    })
  }
}

/**
 * Debug de permisos de administrador
 */
export async function debugAdmin(ctx) {
  try {
    const { isGroup, sock, remoteJid, sender } = ctx

    if (!isGroup) {
      return errorResponse('❌ Este comando solo funciona en grupos.', {
        command: 'debugadmin',
        reason: 'not_in_group',
      })
    }

    const roles = await getGroupRoles(sock, remoteJid, sender)
    const metadata = await getGroupMetadataCached(sock, remoteJid)
    const admins = (metadata?.participants || []).filter(
      (p) => p.admin === 'admin' || p.admin === 'superadmin' || p.admin === 'owner'
    )

    const adminList = admins.map((a) => `@${a.id.split('@')[0]}`).join(', ')

    const lines = [
      `🧪 Debug Admin`,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      `isGroup: ${!!isGroup} ✅`,
      `isAdmin: ${!!roles.isAdmin} ${roles.isAdmin ? '✅' : '❌'}`,
      `isBotAdmin: ${!!roles.isBotAdmin} ${roles.isBotAdmin ? '✅' : '❌'}`,
      `isSuperAdmin: ${!!roles.isSuperAdmin} ${roles.isSuperAdmin ? '✅' : '❌'}`,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      `👑 Administradores: ${adminList || '(ninguno)'}`,
      `📊 Total: ${admins.length}`,
    ]

    const debugMetadata = {
      isAdmin: roles.isAdmin,
      isBotAdmin: roles.isBotAdmin,
      isSuperAdmin: roles.isSuperAdmin,
      adminCount: admins.length,
      admins: admins.map((a) => a.id),
    }

    logCommandExecution('debugadmin', ctx, true, debugMetadata)
    return successResponse(lines.join('\n'), {
      mentions: admins.map((a) => a.id),
      metadata: debugMetadata,
    })
  } catch (e) {
    logCommandError('debugadmin', ctx, e)
    return errorResponse('⚠️ Error al obtener información de admins.', {
      command: 'debugadmin',
      error: e.message,
    })
  }
}

/**
 * Debug de información del grupo
 */
export async function debugGroup(ctx) {
  try {
    const { sock, remoteJid, isGroup } = ctx

    if (!isGroup) {
      return errorResponse('❌ Este comando solo funciona en grupos.', {
        command: 'debuggroup',
        reason: 'not_in_group',
      })
    }

    const meta = await getGroupMetadataCached(sock, remoteJid)

    const lines = [
      `🧪 Debug Grupo`,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      `🆔 ID: ${meta?.id || '-'}`,
      `📝 Nombre: ${meta?.subject || '-'}`,
      `👥 Miembros: ${Array.isArray(meta?.participants) ? meta.participants.length : 0}`,
      `🔒 Anuncio: ${meta?.announce ? 'Sí ✅' : 'No ❌'}`,
      `🔐 Restricción: ${meta?.restrict ? 'Sí ✅' : 'No ❌'}`,
      `📅 Creado: ${meta?.creation ? new Date(meta.creation * 1000).toLocaleString() : '-'}`,
    ]

    const groupMetadata = {
      id: meta?.id,
      subject: meta?.subject,
      participants: meta?.participants?.length || 0,
      announce: !!meta?.announce,
      restrict: !!meta?.restrict,
      creation: meta?.creation,
    }

    logCommandExecution('debuggroup', ctx, true, groupMetadata)
    return successResponse(lines.join('\n'), { metadata: groupMetadata })
  } catch (e) {
    logCommandError('debuggroup', ctx, e)
    return errorResponse('⚠️ Error al obtener información del grupo.', {
      command: 'debuggroup',
      error: e.message,
    })
  }
}

// Aliases
export const testAdmin = checkOwner
export const debugMe = ownerInfo
export const debugFull = debugBot

export default {
  ownerInfo,
  checkOwner,
  setOwner,
  debugBot,
  whoami,
  debugAdmin,
  debugGroup,
  testAdmin,
  debugMe,
  debugFull,
}

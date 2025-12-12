// commands/admin.js
// Debug y utilidades de owner/admin con context-builder

import logger from '../config/logger.js'
import { getTheme } from '../utils/utils/theme.js'
import { setPrimaryOwner } from '../config/global-config.js'
import { getGroupRoles, getGroupMetadataCached } from '../utils/utils/group-helper.js'
import { buildCommandContext, validateOwner, logContext } from '../utils/context-builder.js'
import { successResponse, errorResponse, logCommandExecution, logCommandError, onlyDigits, extractUserInfo } from '../utils/command-helpers.js'

export async function ownerInfo(ctx) {
  try {
    const fullCtx = await buildCommandContext(ctx.sock, ctx.message, ctx.remoteJid, ctx.sender, ctx.pushName)
    logContext(fullCtx, 'ownerinfo_command')

    const th = getTheme()
    const roles = fullCtx.isOwner ? ['owner'] : []

    const msg = `${th.header('👤 TU PERFIL')}\n📱 Número: +${fullCtx.usuarioNumber}\n🎭 Roles: ${roles.join(', ') || 'ninguno'}\n${th.footer()}`

    logCommandExecution('ownerinfo', fullCtx, true, { roles })
    return successResponse(msg, { metadata: { roles, userNumber: fullCtx.usuarioNumber } })
  } catch (e) {
    logCommandError('ownerinfo', ctx, e)
    return errorResponse('⚠️ Error al obtener información.', { command: 'ownerinfo', error: e.message })
  }
}

export async function checkOwner(ctx) {
  try {
    const fullCtx = await buildCommandContext(ctx.sock, ctx.message, ctx.remoteJid, ctx.sender, ctx.pushName)
    logContext(fullCtx, 'checkowner_command')

    if (!fullCtx.isOwner) {
      logCommandExecution('checkowner', fullCtx, false, { reason: 'not_owner' })
      return errorResponse('❌ No tienes el rol de owner.', { command: 'checkowner', isOwner: false })
    }

    logCommandExecution('checkowner', fullCtx, true)
    return successResponse('✅ Tienes el rol de owner.', { metadata: { isOwner: true } })
  } catch (e) {
    logCommandError('checkowner', ctx, e)
    return errorResponse('⚠️ Error al verificar rol.', { command: 'checkowner', error: e.message })
  }
}

export async function setOwner(ctx) {
  try {
    const fullCtx = await buildCommandContext(ctx.sock, ctx.message, ctx.remoteJid, ctx.sender, ctx.pushName)
    logContext(fullCtx, 'setowner_command')

    const ownerCheck = await validateOwner(fullCtx)
    if (!ownerCheck.valid) {
      logCommandExecution('setowner', fullCtx, false, { reason: 'not_owner' })
      return errorResponse(ownerCheck.message, { command: 'setowner', reason: 'not_owner' })
    }

    const numero = onlyDigits(fullCtx.args?.[0] || '')
    const nombre = fullCtx.args?.slice(1).join(' ') || 'Owner'

    if (!numero || numero.length < 10) {
      logCommandExecution('setowner', fullCtx, false, { reason: 'invalid_number' })
      return errorResponse('❌ Uso: /setowner <número> <nombre>\n📝 El número debe tener al menos 10 dígitos.', { command: 'setowner', reason: 'invalid_number' })
    }

    setPrimaryOwner(numero, nombre)

    logger.info({ scope: 'command', command: 'setowner', user: fullCtx.senderNumber, newOwner: numero, newOwnerName: nombre }, `🔑 Owner configurado: ${nombre} (+${numero})`)

    logCommandExecution('setowner', fullCtx, true, { newOwner: numero, newOwnerName: nombre })
    return successResponse(`✅ Owner principal configurado: ${nombre} (+${numero})`, { metadata: { newOwner: numero, newOwnerName: nombre } })
  } catch (e) {
    logCommandError('setowner', ctx, e)
    return errorResponse('⚠️ Error al configurar owner.', { command: 'setowner', error: e.message })
  }
}

export async function debugBot(ctx) {
  try {
    const fullCtx = await buildCommandContext(ctx.sock, ctx.message, ctx.remoteJid, ctx.sender, ctx.pushName)
    logContext(fullCtx, 'debugbot_command')

    const th = getTheme()
    const botNumber = onlyDigits(ctx.sock?.user?.id || '')
    const envOwner = onlyDigits(process.env.OWNER_WHATSAPP_NUMBER || '')

    let groupInfo = null
    if (fullCtx.isGroup && fullCtx.groupMetadata) {
      groupInfo = {
        id: fullCtx.groupMetadata?.id,
        subject: fullCtx.groupMetadata?.subject,
        participants: fullCtx.groupMetadata?.participants?.length || 0,
      }
    }

    const botAdminStatus = fullCtx.isBotAdmin ? 'Sí ✅' : 'No ❌'
    const metadataStatus = fullCtx.groupMetadata ? 'Sí ✅' : 'No ❌'

    const body = [
      `🤖 Debug del Bot`,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      `🔧 Bot JID: ${ctx.sock?.user?.id || '(n/a)'}`,
      `📱 Número Base: +${botNumber || '(n/a)'}`,
      `👑 Owner (env): +${envOwner || '(n/a)'}`,
      `👤 Tu Número: +${fullCtx.usuarioNumber || '(n/a)'}`,
      `🎭 Tus Roles: ${fullCtx.isOwner ? 'owner' : 'ninguno'}`,
      `📊 Tu Estatus: ${fullCtx.isAdmin ? 'admin del grupo' : 'miembro'}`,
      fullCtx.isGroup ? `🛡️ Bot Admin en Grupo: ${botAdminStatus}` : null,
      fullCtx.isGroup ? `📋 Metadata Disponible: ${metadataStatus}` : null,
      fullCtx.isGroup && groupInfo ? `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━` : null,
      fullCtx.isGroup && groupInfo ? `📍 Grupo: ${groupInfo.subject || '(sin nombre)'}` : null,
      fullCtx.isGroup && groupInfo ? `👥 Miembros: ${groupInfo.participants}` : null,
    ]
      .filter(Boolean)
      .join('\n')

    const msg = `${th.header('🔍 KONMI BOT - DEBUG')}\n${body}\n${th.footer()}`

    const metadata = {
      botNumber,
      envOwner,
      isAdmin: fullCtx.isAdmin,
      isBotAdmin: fullCtx.isBotAdmin,
      hasGroupMetadata: !!fullCtx.groupMetadata,
      ...(groupInfo && { groupInfo }),
    }

    logCommandExecution('debugbot', fullCtx, true, metadata)
    return successResponse(msg, { metadata })
  } catch (e) {
    logCommandError('debugbot', ctx, e)
    return errorResponse(`⚠️ Error en debug: ${e.message}`, { command: 'debugbot', error: e.message })
  }
}

export async function whoami(ctx) {
  try {
    const fullCtx = await buildCommandContext(ctx.sock, ctx.message, ctx.remoteJid, ctx.sender, ctx.pushName)
    logContext(fullCtx, 'whoami_command')

    let groupName = null
    if (fullCtx.isGroup && fullCtx.groupMetadata) {
      groupName = fullCtx.groupMetadata?.subject || 'desconocido'
    }

    const lines = [
      `🙋‍♂️ Tu Número: +${fullCtx.usuarioNumber}`,
      `📍 Contexto: ${fullCtx.isGroup ? `Grupo (${groupName})` : 'Privado'}`,
      `🛡️ Admin: ${fullCtx.isAdmin ? 'Sí ✅' : 'No ❌'}`,
      `🤖 Bot Admin: ${fullCtx.isBotAdmin ? 'Sí ✅' : 'No ❌'}`,
      `🔧 Bot: +${fullCtx.botNumber || 'desconocido'}`,
    ]

    const metadata = {
      number: fullCtx.usuarioNumber,
      isGroup: fullCtx.isGroup,
      isAdmin: fullCtx.isAdmin,
      isBotAdmin: fullCtx.isBotAdmin,
      botNumber: fullCtx.botNumber,
      ...(groupName && { groupName }),
    }

    logCommandExecution('whoami', fullCtx, true, metadata)
    return successResponse(lines.join('\n'), { metadata })
  } catch (e) {
    logCommandError('whoami', ctx, e)
    return errorResponse('⚠️ Error al obtener información.', { command: 'whoami', error: e.message })
  }
}

export async function debugAdmin(ctx) {
  try {
    const fullCtx = await buildCommandContext(ctx.sock, ctx.message, ctx.remoteJid, ctx.sender, ctx.pushName)
    logContext(fullCtx, 'debugadmin_command')

    if (!fullCtx.isGroup) {
      return errorResponse('❌ Este comando solo funciona en grupos.', { command: 'debugadmin', reason: 'not_in_group' })
    }

    const admins = (fullCtx.groupMetadata?.participants || []).filter(
      (p) => p.admin === 'admin' || p.admin === 'superadmin' || p.admin === 'owner'
    )

    const adminList = admins.map((a) => `@${a.id.split('@')[0]}`).join(', ')

    const lines = [
      `🧪 Debug Admin`,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      `isGroup: ${!!fullCtx.isGroup} ✅`,
      `isAdmin: ${!!fullCtx.isAdmin} ${fullCtx.isAdmin ? '✅' : '❌'}`,
      `isBotAdmin: ${!!fullCtx.isBotAdmin} ${fullCtx.isBotAdmin ? '✅' : '❌'}`,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      `👑 Administradores: ${adminList || '(ninguno)'}`,
      `📊 Total: ${admins.length}`,
    ]

    const debugMetadata = {
      isAdmin: fullCtx.isAdmin,
      isBotAdmin: fullCtx.isBotAdmin,
      adminCount: admins.length,
      admins: admins.map((a) => a.id),
    }

    logCommandExecution('debugadmin', fullCtx, true, debugMetadata)
    return successResponse(lines.join('\n'), { mentions: admins.map((a) => a.id), metadata: debugMetadata })
  } catch (e) {
    logCommandError('debugadmin', ctx, e)
    return errorResponse('⚠️ Error al obtener información de admins.', { command: 'debugadmin', error: e.message })
  }
}

export async function debugGroup(ctx) {
  try {
    const fullCtx = await buildCommandContext(ctx.sock, ctx.message, ctx.remoteJid, ctx.sender, ctx.pushName)
    logContext(fullCtx, 'debuggroup_command')

    if (!fullCtx.isGroup) {
      return errorResponse('❌ Este comando solo funciona en grupos.', { command: 'debuggroup', reason: 'not_in_group' })
    }

    const meta = fullCtx.groupMetadata

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

    logCommandExecution('debuggroup', fullCtx, true, groupMetadata)
    return successResponse(lines.join('\n'), { metadata: groupMetadata })
  } catch (e) {
    logCommandError('debuggroup', ctx, e)
    return errorResponse('⚠️ Error al obtener información del grupo.', { command: 'debuggroup', error: e.message })
  }
}

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

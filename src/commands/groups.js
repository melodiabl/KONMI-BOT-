// commands/groups.js
// Administración de grupos con context-builder

import logger from '../config/logger.js'
import db from '../database/db.js'
import { getGroupRoles, getGroupMetadataCached } from '../utils/utils/group-helper.js'
import { buildCommandContext, validateAdminInGroup, validateBotAdminInGroup, logContext } from '../utils/context-builder.js'
import {
  onlyDigits,
  first,
  successResponse,
  errorResponse,
  logCommandExecution,
  logCommandError,
  extractUserInfo,
  extractTargetJid,
} from '../utils/command-helpers.js'

let groupsTableInitialized = false

async function ensureGroupsTable() {
  if (groupsTableInitialized) return

  try {
    const exists = await db.schema.hasTable('grupos_autorizados')
    if (!exists) {
      await db.schema.createTable('grupos_autorizados', (t) => {
        t.increments('id')
        t.string('jid').unique().notNullable()
        t.boolean('bot_enabled').defaultTo(true)
        t.string('tipo').nullable()
        t.timestamp('updated_at').defaultTo(db.fn.now())
      })
      logger.info({ scope: 'database', table: 'grupos_autorizados' }, '✅ Tabla grupos_autorizados creada')
    }
    groupsTableInitialized = true
  } catch (e) {
    logger.error({ scope: 'database', table: 'grupos_autorizados', error: e.message }, `❌ Error creando tabla: ${e.message}`)
    throw e
  }
}

export async function kick(ctx) {
  try {
    const fullCtx = await buildCommandContext(ctx.sock, ctx.message, ctx.remoteJid, ctx.sender, ctx.pushName)
    logContext(fullCtx, 'kick_command')

    if (!fullCtx.isGroup) {
      return errorResponse('❌ Este comando solo funciona en grupos.', { command: 'kick', reason: 'not_in_group' })
    }

    const adminCheck = await validateAdminInGroup(fullCtx)
    if (!adminCheck.valid) {
      logCommandExecution('kick', fullCtx, false, { reason: adminCheck.reason })
      return errorResponse(adminCheck.message, { command: 'kick', reason: adminCheck.reason })
    }

    const botAdminCheck = await validateBotAdminInGroup(fullCtx)
    if (!botAdminCheck.valid) {
      logCommandExecution('kick', fullCtx, false, { reason: botAdminCheck.reason })
      return errorResponse(botAdminCheck.message, { command: 'kick', reason: botAdminCheck.reason })
    }

    let targetJid =
      first(ctx.message?.message?.extendedTextMessage?.contextInfo?.mentionedJid) ||
      ctx.message?.message?.extendedTextMessage?.contextInfo?.participant

    if (!targetJid && Array.isArray(fullCtx.args) && fullCtx.args.length > 0) {
      const digits = onlyDigits(fullCtx.args[0])
      if (digits) targetJid = `${digits}@s.whatsapp.net`
    }

    if (!targetJid) {
      logCommandExecution('kick', fullCtx, false, { reason: 'no_target' })
      return errorResponse('❌ Uso: /kick @usuario o responde al mensaje de alguien con /kick.', { command: 'kick', reason: 'no_target' })
    }

    if (targetJid === fullCtx.sender) {
      logCommandExecution('kick', fullCtx, false, { reason: 'self_kick' })
      return errorResponse('🚫 No puedes expulsarte a ti mismo.', { command: 'kick', reason: 'self_kick' })
    }

    await fullCtx.sock.groupParticipantsUpdate(fullCtx.remoteJid, [targetJid], 'remove')

    const targetInfo = extractUserInfo(targetJid)
    const executorInfo = extractUserInfo(fullCtx.sender)

    logger.info(
      { scope: 'command', command: 'kick', target: targetInfo.number, executor: executorInfo.number, group: fullCtx.remoteJid },
      `👢 Usuario ${targetInfo.mention} expulsado por ${executorInfo.mention}`
    )

    logCommandExecution('kick', fullCtx, true, { target: targetInfo.number, executor: executorInfo.number })

    return successResponse(`👢 Usuario ${targetInfo.mention} ha sido expulsado por ${executorInfo.mention}.`, {
      mentions: [targetJid, fullCtx.sender],
      metadata: { target: targetInfo.number, executor: executorInfo.number },
    })
  } catch (e) {
    logCommandError('kick', ctx, e)
    return errorResponse('⚠️ Error al expulsar al usuario.', { command: 'kick', error: e.message })
  }
}

export async function promote(ctx) {
  try {
    const fullCtx = await buildCommandContext(ctx.sock, ctx.message, ctx.remoteJid, ctx.sender, ctx.pushName)
    logContext(fullCtx, 'promote_command')

    if (!fullCtx.isGroup) {
      return errorResponse('❌ Este comando solo funciona en grupos.', { command: 'promote', reason: 'not_in_group' })
    }

    const adminCheck = await validateAdminInGroup(fullCtx)
    if (!adminCheck.valid) {
      logCommandExecution('promote', fullCtx, false, { reason: adminCheck.reason })
      return errorResponse(adminCheck.message, { command: 'promote', reason: adminCheck.reason })
    }

    const botAdminCheck = await validateBotAdminInGroup(fullCtx)
    if (!botAdminCheck.valid) {
      logCommandExecution('promote', fullCtx, false, { reason: botAdminCheck.reason })
      return errorResponse(botAdminCheck.message, { command: 'promote', reason: botAdminCheck.reason })
    }

    const targetJid =
      first(ctx.message?.message?.extendedTextMessage?.contextInfo?.mentionedJid) ||
      ctx.message?.message?.extendedTextMessage?.contextInfo?.participant ||
      (Array.isArray(fullCtx.args) && fullCtx.args.length > 0 ? `${onlyDigits(fullCtx.args[0])}@s.whatsapp.net` : null)

    if (!targetJid) {
      logCommandExecution('promote', fullCtx, false, { reason: 'no_target' })
      return errorResponse('❌ Menciona a un usuario o responde a su mensaje para promoverlo.', { command: 'promote', reason: 'no_target' })
    }

    if (targetJid === fullCtx.sender) {
      logCommandExecution('promote', fullCtx, false, { reason: 'self_promote' })
      return errorResponse('🚫 No puedes promoverte a ti mismo.', { command: 'promote', reason: 'self_promote' })
    }

    await fullCtx.sock.groupParticipantsUpdate(fullCtx.remoteJid, [targetJid], 'promote')

    const targetInfo = extractUserInfo(targetJid)
    const executorInfo = extractUserInfo(fullCtx.sender)

    logger.info(
      { scope: 'command', command: 'promote', target: targetInfo.number, executor: executorInfo.number, group: fullCtx.remoteJid },
      `🆙 Usuario ${targetInfo.mention} promovido a administrador por ${executorInfo.mention}`
    )

    logCommandExecution('promote', fullCtx, true, { target: targetInfo.number, executor: executorInfo.number })

    return successResponse(`🆙 ${targetInfo.mention} ha sido promovido a administrador.`, {
      mentions: [targetJid],
      metadata: { target: targetInfo.number, executor: executorInfo.number },
    })
  } catch (e) {
    logCommandError('promote', ctx, e)
    return errorResponse('⚠️ Error al promover al usuario.', { command: 'promote', error: e.message })
  }
}

export async function demote(ctx) {
  try {
    const fullCtx = await buildCommandContext(ctx.sock, ctx.message, ctx.remoteJid, ctx.sender, ctx.pushName)
    logContext(fullCtx, 'demote_command')

    if (!fullCtx.isGroup) {
      return errorResponse('❌ Este comando solo funciona en grupos.', { command: 'demote', reason: 'not_in_group' })
    }

    const adminCheck = await validateAdminInGroup(fullCtx)
    if (!adminCheck.valid) {
      logCommandExecution('demote', fullCtx, false, { reason: adminCheck.reason })
      return errorResponse(adminCheck.message, { command: 'demote', reason: adminCheck.reason })
    }

    const botAdminCheck = await validateBotAdminInGroup(fullCtx)
    if (!botAdminCheck.valid) {
      logCommandExecution('demote', fullCtx, false, { reason: botAdminCheck.reason })
      return errorResponse(botAdminCheck.message, { command: 'demote', reason: botAdminCheck.reason })
    }

    const targetJid =
      first(ctx.message?.message?.extendedTextMessage?.contextInfo?.mentionedJid) ||
      ctx.message?.message?.extendedTextMessage?.contextInfo?.participant ||
      (Array.isArray(fullCtx.args) && fullCtx.args.length > 0 ? `${onlyDigits(fullCtx.args[0])}@s.whatsapp.net` : null)

    if (!targetJid) {
      logCommandExecution('demote', fullCtx, false, { reason: 'no_target' })
      return errorResponse('❌ Menciona a un usuario o responde a su mensaje para degradarlo.', { command: 'demote', reason: 'no_target' })
    }

    if (targetJid === fullCtx.sender) {
      logCommandExecution('demote', fullCtx, false, { reason: 'self_demote' })
      return errorResponse('🚫 No puedes degradarte a ti mismo.', { command: 'demote', reason: 'self_demote' })
    }

    await fullCtx.sock.groupParticipantsUpdate(fullCtx.remoteJid, [targetJid], 'demote')

    const targetInfo = extractUserInfo(targetJid)
    const executorInfo = extractUserInfo(fullCtx.sender)

    logger.info(
      { scope: 'command', command: 'demote', target: targetInfo.number, executor: executorInfo.number, group: fullCtx.remoteJid },
      `🔽 Usuario ${targetInfo.mention} degradado por ${executorInfo.mention}`
    )

    logCommandExecution('demote', fullCtx, true, { target: targetInfo.number, executor: executorInfo.number })

    return successResponse(`🔽 ${targetInfo.mention} ya no es administrador.`, {
      mentions: [targetJid],
      metadata: { target: targetInfo.number, executor: executorInfo.number },
    })
  } catch (e) {
    logCommandError('demote', ctx, e)
    return errorResponse('⚠️ Error al degradar al usuario.', { command: 'demote', error: e.message })
  }
}

export async function lock(ctx) {
  try {
    const fullCtx = await buildCommandContext(ctx.sock, ctx.message, ctx.remoteJid, ctx.sender, ctx.pushName)
    logContext(fullCtx, 'lock_command')

    if (!fullCtx.isGroup) {
      return errorResponse('❌ Este comando solo funciona en grupos.', { command: 'lock', reason: 'not_in_group' })
    }

    const adminCheck = await validateAdminInGroup(fullCtx)
    if (!adminCheck.valid) {
      logCommandExecution('lock', fullCtx, false, { reason: adminCheck.reason })
      return errorResponse(adminCheck.message, { command: 'lock', reason: adminCheck.reason })
    }

    const botAdminCheck = await validateBotAdminInGroup(fullCtx)
    if (!botAdminCheck.valid) {
      logCommandExecution('lock', fullCtx, false, { reason: botAdminCheck.reason })
      return errorResponse(botAdminCheck.message, { command: 'lock', reason: botAdminCheck.reason })
    }

    await fullCtx.sock.groupSettingUpdate(fullCtx.remoteJid, 'announcement')

    const executorInfo = extractUserInfo(fullCtx.sender)
    logger.info(
      { scope: 'command', command: 'lock', executor: executorInfo.number, group: fullCtx.remoteJid },
      `🔒 Grupo bloqueado por ${executorInfo.mention}`
    )

    logCommandExecution('lock', fullCtx, true, { executor: executorInfo.number })

    return successResponse('🔒 Grupo bloqueado. Solo administradores pueden enviar mensajes.', {
      metadata: { executor: executorInfo.number },
    })
  } catch (e) {
    logCommandError('lock', ctx, e)
    return errorResponse('⚠️ Error al bloquear el grupo.', { command: 'lock', error: e.message })
  }
}

export async function unlock(ctx) {
  try {
    const fullCtx = await buildCommandContext(ctx.sock, ctx.message, ctx.remoteJid, ctx.sender, ctx.pushName)
    logContext(fullCtx, 'unlock_command')

    if (!fullCtx.isGroup) {
      return errorResponse('❌ Este comando solo funciona en grupos.', { command: 'unlock', reason: 'not_in_group' })
    }

    const adminCheck = await validateAdminInGroup(fullCtx)
    if (!adminCheck.valid) {
      logCommandExecution('unlock', fullCtx, false, { reason: adminCheck.reason })
      return errorResponse(adminCheck.message, { command: 'unlock', reason: adminCheck.reason })
    }

    const botAdminCheck = await validateBotAdminInGroup(fullCtx)
    if (!botAdminCheck.valid) {
      logCommandExecution('unlock', fullCtx, false, { reason: botAdminCheck.reason })
      return errorResponse(botAdminCheck.message, { command: 'unlock', reason: botAdminCheck.reason })
    }

    await fullCtx.sock.groupSettingUpdate(fullCtx.remoteJid, 'not_announcement')

    const executorInfo = extractUserInfo(fullCtx.sender)
    logger.info(
      { scope: 'command', command: 'unlock', executor: executorInfo.number, group: fullCtx.remoteJid },
      `🔓 Grupo desbloqueado por ${executorInfo.mention}`
    )

    logCommandExecution('unlock', fullCtx, true, { executor: executorInfo.number })

    return successResponse('🔓 Grupo desbloqueado. Todos los miembros pueden enviar mensajes.', {
      metadata: { executor: executorInfo.number },
    })
  } catch (e) {
    logCommandError('unlock', ctx, e)
    return errorResponse('⚠️ Error al desbloquear el grupo.', { command: 'unlock', error: e.message })
  }
}

export async function tag(ctx) {
  try {
    const fullCtx = await buildCommandContext(ctx.sock, ctx.message, ctx.remoteJid, ctx.sender, ctx.pushName)
    logContext(fullCtx, 'tag_command')

    if (!fullCtx.isGroup) {
      return errorResponse('❌ Este comando solo funciona en grupos.', { command: 'tag', reason: 'not_in_group' })
    }

    const adminCheck = await validateAdminInGroup(fullCtx)
    if (!adminCheck.valid) {
      logCommandExecution('tag', fullCtx, false, { reason: adminCheck.reason })
      return errorResponse(adminCheck.message, { command: 'tag', reason: adminCheck.reason })
    }

    const metadata = fullCtx.groupMetadata
    const participants = metadata?.participants || []

    if (participants.length === 0) {
      logCommandExecution('tag', fullCtx, false, { reason: 'no_participants' })
      return errorResponse('⚠️ No se pudo obtener la lista de miembros.', { command: 'tag', reason: 'no_participants' })
    }

    const mentions = participants.map((p) => p.id)
    const text = (Array.isArray(fullCtx.args) && fullCtx.args.join(' ').trim()) || '📢 ¡Atención a todos!'

    const executorInfo = extractUserInfo(fullCtx.sender)
    logger.info(
      { scope: 'command', command: 'tag', executor: executorInfo.number, mentionCount: mentions.length, group: fullCtx.remoteJid },
      `📢 Tag enviado a ${mentions.length} miembros por ${executorInfo.mention}`
    )

    logCommandExecution('tag', fullCtx, true, { executor: executorInfo.number, mentionCount: mentions.length })

    return successResponse(text, {
      mentions,
      metadata: { executor: executorInfo.number, mentionCount: mentions.length },
    })
  } catch (e) {
    logCommandError('tag', ctx, e)
    return errorResponse('⚠️ Error al enviar tag.', { command: 'tag', error: e.message })
  }
}

export async function admins(ctx) {
  try {
    const fullCtx = await buildCommandContext(ctx.sock, ctx.message, ctx.remoteJid, ctx.sender, ctx.pushName)
    logContext(fullCtx, 'admins_command')

    if (!fullCtx.isGroup) {
      return errorResponse('❌ Este comando solo funciona en grupos.', { command: 'admins', reason: 'not_in_group' })
    }

    const metadata = fullCtx.groupMetadata
    const admins = (metadata?.participants || []).filter(
      (p) => p.admin === 'admin' || p.admin === 'superadmin' || p.admin === 'owner'
    )

    if (admins.length === 0) {
      logCommandExecution('admins', fullCtx, true, { adminCount: 0 })
      return successResponse('ℹ️ No hay administradores en este grupo.', { metadata: { adminCount: 0 } })
    }

    const list = admins
      .map((a, i) => {
        const info = extractUserInfo(a.id)
        const role = a.admin === 'owner' ? '👑' : a.admin === 'superadmin' ? '⭐' : '🛡️'
        return `${i + 1}. ${role} ${info.mention}`
      })
      .join('\n')

    const mentions = admins.map((a) => a.id)
    const message = `👑 *Administradores del Grupo*\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n${list}\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n📊 Total: ${admins.length}`

    logger.info(
      { scope: 'command', command: 'admins', group: fullCtx.remoteJid, adminCount: admins.length },
      `👑 Lista de administradores consultada | Total: ${admins.length}`
    )

    logCommandExecution('admins', fullCtx, true, { adminCount: admins.length })

    return successResponse(message, {
      mentions,
      metadata: {
        adminCount: admins.length,
        admins: admins.map((a) => ({ jid: a.id, role: a.admin })),
      },
    })
  } catch (e) {
    logCommandError('admins', ctx, e)
    return errorResponse('⚠️ Error al obtener lista de administradores.', { command: 'admins', error: e.message })
  }
}

export async function addGroup(ctx) {
  try {
    const fullCtx = await buildCommandContext(ctx.sock, ctx.message, ctx.remoteJid, ctx.sender, ctx.pushName)
    logContext(fullCtx, 'addgroup_command')

    if (!fullCtx.isGroup) {
      return errorResponse('❌ Este comando solo funciona en grupos.', { command: 'addgroup', reason: 'not_in_group' })
    }

    const adminCheck = await validateAdminInGroup(fullCtx)
    if (!adminCheck.valid) {
      logCommandExecution('addgroup', fullCtx, false, { reason: adminCheck.reason })
      return errorResponse(adminCheck.message, { command: 'addgroup', reason: adminCheck.reason })
    }

    await ensureGroupsTable()

    const existing = await db('grupos_autorizados').where({ jid: fullCtx.remoteJid }).first()

    if (existing) {
      await db('grupos_autorizados').where({ jid: fullCtx.remoteJid }).update({ bot_enabled: true })
    } else {
      await db('grupos_autorizados').insert({
        jid: fullCtx.remoteJid,
        bot_enabled: true,
        tipo: 'general',
      })
    }

    const executorInfo = extractUserInfo(fullCtx.sender)
    logger.info(
      { scope: 'command', command: 'addgroup', executor: executorInfo.number, group: fullCtx.remoteJid },
      `✅ Bot habilitado en grupo por ${executorInfo.mention}`
    )

    logCommandExecution('addgroup', fullCtx, true, { executor: executorInfo.number })

    return successResponse('✅ Bot habilitado en este grupo.', { metadata: { executor: executorInfo.number } })
  } catch (e) {
    logCommandError('addgroup', ctx, e)
    return errorResponse('⚠️ Error al habilitar el bot.', { command: 'addgroup', error: e.message })
  }
}

export async function delGroup(ctx) {
  try {
    const fullCtx = await buildCommandContext(ctx.sock, ctx.message, ctx.remoteJid, ctx.sender, ctx.pushName)
    logContext(fullCtx, 'delgroup_command')

    if (!fullCtx.isGroup) {
      return errorResponse('❌ Este comando solo funciona en grupos.', { command: 'delgroup', reason: 'not_in_group' })
    }

    const adminCheck = await validateAdminInGroup(fullCtx)
    if (!adminCheck.valid) {
      logCommandExecution('delgroup', fullCtx, false, { reason: adminCheck.reason })
      return errorResponse(adminCheck.message, { command: 'delgroup', reason: adminCheck.reason })
    }

    await ensureGroupsTable()
    await db('grupos_autorizados').where({ jid: fullCtx.remoteJid }).update({ bot_enabled: false })

    const executorInfo = extractUserInfo(fullCtx.sender)
    logger.info(
      { scope: 'command', command: 'delgroup', executor: executorInfo.number, group: fullCtx.remoteJid },
      `🚫 Bot deshabilitado en grupo por ${executorInfo.mention}`
    )

    logCommandExecution('delgroup', fullCtx, true, { executor: executorInfo.number })

    return successResponse('🚫 Bot deshabilitado en este grupo.', { metadata: { executor: executorInfo.number } })
  } catch (e) {
    logCommandError('delgroup', ctx, e)
    return errorResponse('⚠️ Error al desactivar el bot.', { command: 'delgroup', error: e.message })
  }
}

export default {
  addGroup,
  delGroup,
  kick,
  promote,
  demote,
  lock,
  unlock,
  tag,
  admins,
}

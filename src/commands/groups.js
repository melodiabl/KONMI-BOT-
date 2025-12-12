// commands/groups.js
// Administración de grupos con logging mejorado y metadata real

import logger from '../config/logger.js'
import db from '../database/db.js'
import { getGroupRoles, getGroupMetadataCached } from '../utils/utils/group-helper.js'
import {
  onlyDigits,
  first,
  successResponse,
  errorResponse,
  logCommandExecution,
  logCommandError,
  validateAdminPermission,
  extractUserInfo,
  extractTargetJid,
} from '../utils/command-helpers.js'

let groupsTableInitialized = false

/**
 * Asegura que la tabla de grupos existe
 */
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
      logger.info(
        { scope: 'database', table: 'grupos_autorizados' },
        '✅ Tabla grupos_autorizados creada exitosamente'
      )
    }
    groupsTableInitialized = true
  } catch (e) {
    logger.error(
      { scope: 'database', table: 'grupos_autorizados', error: e.message },
      `❌ Error al crear tabla grupos_autorizados: ${e.message}`
    )
    throw e
  }
}

/**
 * Expulsa a un usuario del grupo
 */
export async function kick(ctx) {
  try {
    const { isGroup, remoteJid, args, sock, message, sender } = ctx

    if (!isGroup) {
      return errorResponse('❌ Este comando solo funciona en grupos.', {
        command: 'kick',
        reason: 'not_in_group',
      })
    }

    const { isAdmin, isBotAdmin } = await getGroupRoles(sock, remoteJid, sender)

    if (!isAdmin) {
      logCommandExecution('kick', ctx, false, { reason: 'not_admin' })
      return errorResponse('🚫 No tienes permisos de administrador para hacer esto.', {
        command: 'kick',
        reason: 'not_admin',
      })
    }

    if (!isBotAdmin) {
      logCommandExecution('kick', ctx, false, { reason: 'bot_not_admin' })
      return errorResponse('🚫 El bot necesita ser administrador para poder expulsar miembros.', {
        command: 'kick',
        reason: 'bot_not_admin',
      })
    }

    let targetJid =
      first(message?.message?.extendedTextMessage?.contextInfo?.mentionedJid) ||
      message?.message?.extendedTextMessage?.contextInfo?.participant

    if (!targetJid && Array.isArray(args) && args.length > 0) {
      const digits = onlyDigits(args[0])
      if (digits) targetJid = `${digits}@s.whatsapp.net`
    }

    if (!targetJid) {
      logCommandExecution('kick', ctx, false, { reason: 'no_target' })
      return errorResponse('❌ Uso: /kick @usuario o responde al mensaje de alguien con /kick.', {
        command: 'kick',
        reason: 'no_target',
      })
    }

    if (targetJid === sender) {
      logCommandExecution('kick', ctx, false, { reason: 'self_kick' })
      return errorResponse('🚫 No puedes expulsarte a ti mismo.', {
        command: 'kick',
        reason: 'self_kick',
      })
    }

    await sock.groupParticipantsUpdate(remoteJid, [targetJid], 'remove')

    const targetInfo = extractUserInfo(targetJid)
    const executorInfo = extractUserInfo(sender)

    logger.info(
      {
        scope: 'command',
        command: 'kick',
        target: targetInfo.number,
        executor: executorInfo.number,
        group: remoteJid,
      },
      `👢 Usuario ${targetInfo.mention} expulsado por ${executorInfo.mention}`
    )

    logCommandExecution('kick', ctx, true, {
      target: targetInfo.number,
      executor: executorInfo.number,
    })

    return successResponse(
      `👢 Usuario ${targetInfo.mention} ha sido expulsado por ${executorInfo.mention}.`,
      {
        mentions: [targetJid, sender],
        metadata: {
          target: targetInfo.number,
          executor: executorInfo.number,
        },
      }
    )
  } catch (e) {
    logCommandError('kick', ctx, e)
    return errorResponse('⚠️ Error al expulsar al usuario. Intenta de nuevo.', {
      command: 'kick',
      error: e.message,
    })
  }
}

/**
 * Promueve a un usuario a administrador
 */
export async function promote(ctx) {
  try {
    const { isGroup, remoteJid, args, sock, message, sender } = ctx

    if (!isGroup) {
      return errorResponse('❌ Este comando solo funciona en grupos.', {
        command: 'promote',
        reason: 'not_in_group',
      })
    }

    const { isAdmin, isBotAdmin } = await getGroupRoles(sock, remoteJid, sender)

    if (!isAdmin) {
      logCommandExecution('promote', ctx, false, { reason: 'not_admin' })
      return errorResponse('🚫 No eres administrador.', {
        command: 'promote',
        reason: 'not_admin',
      })
    }

    if (!isBotAdmin) {
      logCommandExecution('promote', ctx, false, { reason: 'bot_not_admin' })
      return errorResponse('🚫 El bot no es administrador.', {
        command: 'promote',
        reason: 'bot_not_admin',
      })
    }

    const targetJid =
      first(message?.message?.extendedTextMessage?.contextInfo?.mentionedJid) ||
      message?.message?.extendedTextMessage?.contextInfo?.participant ||
      (Array.isArray(args) && args.length > 0 ? `${onlyDigits(args[0])}@s.whatsapp.net` : null)

    if (!targetJid) {
      logCommandExecution('promote', ctx, false, { reason: 'no_target' })
      return errorResponse('❌ Menciona a un usuario o responde a su mensaje para promoverlo.', {
        command: 'promote',
        reason: 'no_target',
      })
    }

    if (targetJid === sender) {
      logCommandExecution('promote', ctx, false, { reason: 'self_promote' })
      return errorResponse('🚫 No puedes promoverte a ti mismo.', {
        command: 'promote',
        reason: 'self_promote',
      })
    }

    await sock.groupParticipantsUpdate(remoteJid, [targetJid], 'promote')

    const targetInfo = extractUserInfo(targetJid)
    const executorInfo = extractUserInfo(sender)

    logger.info(
      {
        scope: 'command',
        command: 'promote',
        target: targetInfo.number,
        executor: executorInfo.number,
        group: remoteJid,
      },
      `🆙 Usuario ${targetInfo.mention} promovido a administrador por ${executorInfo.mention}`
    )

    logCommandExecution('promote', ctx, true, {
      target: targetInfo.number,
      executor: executorInfo.number,
    })

    return successResponse(`🆙 ${targetInfo.mention} ha sido promovido a administrador.`, {
      mentions: [targetJid],
      metadata: {
        target: targetInfo.number,
        executor: executorInfo.number,
      },
    })
  } catch (e) {
    logCommandError('promote', ctx, e)
    return errorResponse('⚠️ Error al promover al usuario. Intenta de nuevo.', {
      command: 'promote',
      error: e.message,
    })
  }
}

/**
 * Degrada a un usuario de administrador
 */
export async function demote(ctx) {
  try {
    const { isGroup, remoteJid, args, sock, message, sender } = ctx

    if (!isGroup) {
      return errorResponse('❌ Este comando solo funciona en grupos.', {
        command: 'demote',
        reason: 'not_in_group',
      })
    }

    const { isAdmin, isBotAdmin } = await getGroupRoles(sock, remoteJid, sender)

    if (!isAdmin) {
      logCommandExecution('demote', ctx, false, { reason: 'not_admin' })
      return errorResponse('🚫 No eres administrador.', {
        command: 'demote',
        reason: 'not_admin',
      })
    }

    if (!isBotAdmin) {
      logCommandExecution('demote', ctx, false, { reason: 'bot_not_admin' })
      return errorResponse('🚫 El bot no es administrador.', {
        command: 'demote',
        reason: 'bot_not_admin',
      })
    }

    const targetJid =
      first(message?.message?.extendedTextMessage?.contextInfo?.mentionedJid) ||
      message?.message?.extendedTextMessage?.contextInfo?.participant ||
      (Array.isArray(args) && args.length > 0 ? `${onlyDigits(args[0])}@s.whatsapp.net` : null)

    if (!targetJid) {
      logCommandExecution('demote', ctx, false, { reason: 'no_target' })
      return errorResponse('❌ Menciona a un usuario o responde a su mensaje para degradarlo.', {
        command: 'demote',
        reason: 'no_target',
      })
    }

    if (targetJid === sender) {
      logCommandExecution('demote', ctx, false, { reason: 'self_demote' })
      return errorResponse('🚫 No puedes degradarte a ti mismo.', {
        command: 'demote',
        reason: 'self_demote',
      })
    }

    await sock.groupParticipantsUpdate(remoteJid, [targetJid], 'demote')

    const targetInfo = extractUserInfo(targetJid)
    const executorInfo = extractUserInfo(sender)

    logger.info(
      {
        scope: 'command',
        command: 'demote',
        target: targetInfo.number,
        executor: executorInfo.number,
        group: remoteJid,
      },
      `🔽 Usuario ${targetInfo.mention} degradado por ${executorInfo.mention}`
    )

    logCommandExecution('demote', ctx, true, {
      target: targetInfo.number,
      executor: executorInfo.number,
    })

    return successResponse(`🔽 ${targetInfo.mention} ya no es administrador.`, {
      mentions: [targetJid],
      metadata: {
        target: targetInfo.number,
        executor: executorInfo.number,
      },
    })
  } catch (e) {
    logCommandError('demote', ctx, e)
    return errorResponse('⚠️ Error al degradar al usuario. Intenta de nuevo.', {
      command: 'demote',
      error: e.message,
    })
  }
}

/**
 * Bloquea el grupo (solo admins pueden escribir)
 */
export async function lock(ctx) {
  try {
    const { isGroup, remoteJid, sock, sender } = ctx

    if (!isGroup) {
      return errorResponse('❌ Este comando solo funciona en grupos.', {
        command: 'lock',
        reason: 'not_in_group',
      })
    }

    const { isAdmin, isBotAdmin } = await getGroupRoles(sock, remoteJid, sender)

    if (!isAdmin) {
      logCommandExecution('lock', ctx, false, { reason: 'not_admin' })
      return errorResponse('🚫 No tienes permisos de administrador.', {
        command: 'lock',
        reason: 'not_admin',
      })
    }

    if (!isBotAdmin) {
      logCommandExecution('lock', ctx, false, { reason: 'bot_not_admin' })
      return errorResponse('🚫 El bot necesita ser administrador.', {
        command: 'lock',
        reason: 'bot_not_admin',
      })
    }

    await sock.groupSettingUpdate(remoteJid, 'announcement')

    const executorInfo = extractUserInfo(sender)
    logger.info(
      {
        scope: 'command',
        command: 'lock',
        executor: executorInfo.number,
        group: remoteJid,
      },
      `🔒 Grupo bloqueado por ${executorInfo.mention}`
    )

    logCommandExecution('lock', ctx, true, { executor: executorInfo.number })

    return successResponse('🔒 Grupo bloqueado. Solo administradores pueden enviar mensajes.', {
      metadata: { executor: executorInfo.number },
    })
  } catch (e) {
    logCommandError('lock', ctx, e)
    return errorResponse('⚠️ Error al bloquear el grupo. Intenta de nuevo.', {
      command: 'lock',
      error: e.message,
    })
  }
}

/**
 * Desbloquea el grupo (todos pueden escribir)
 */
export async function unlock(ctx) {
  try {
    const { isGroup, remoteJid, sock, sender } = ctx

    if (!isGroup) {
      return errorResponse('❌ Este comando solo funciona en grupos.', {
        command: 'unlock',
        reason: 'not_in_group',
      })
    }

    const { isAdmin, isBotAdmin } = await getGroupRoles(sock, remoteJid, sender)

    if (!isAdmin) {
      logCommandExecution('unlock', ctx, false, { reason: 'not_admin' })
      return errorResponse('🚫 No tienes permisos de administrador.', {
        command: 'unlock',
        reason: 'not_admin',
      })
    }

    if (!isBotAdmin) {
      logCommandExecution('unlock', ctx, false, { reason: 'bot_not_admin' })
      return errorResponse('🚫 El bot necesita ser administrador.', {
        command: 'unlock',
        reason: 'bot_not_admin',
      })
    }

    await sock.groupSettingUpdate(remoteJid, 'not_announcement')

    const executorInfo = extractUserInfo(sender)
    logger.info(
      {
        scope: 'command',
        command: 'unlock',
        executor: executorInfo.number,
        group: remoteJid,
      },
      `🔓 Grupo desbloqueado por ${executorInfo.mention}`
    )

    logCommandExecution('unlock', ctx, true, { executor: executorInfo.number })

    return successResponse('🔓 Grupo desbloqueado. Todos los miembros pueden enviar mensajes.', {
      metadata: { executor: executorInfo.number },
    })
  } catch (e) {
    logCommandError('unlock', ctx, e)
    return errorResponse('⚠️ Error al desbloquear el grupo. Intenta de nuevo.', {
      command: 'unlock',
      error: e.message,
    })
  }
}

/**
 * Etiqueta a todos los miembros del grupo
 */
export async function tag(ctx) {
  try {
    const { message, remoteJid, sock, args, sender, isGroup } = ctx

    if (!isGroup) {
      return errorResponse('❌ Este comando solo funciona en grupos.', {
        command: 'tag',
        reason: 'not_in_group',
      })
    }

    const { isAdmin } = await getGroupRoles(sock, remoteJid, sender)

    if (!isAdmin) {
      logCommandExecution('tag', ctx, false, { reason: 'not_admin' })
      return errorResponse('🚫 Solo los administradores pueden usar /tag.', {
        command: 'tag',
        reason: 'not_admin',
      })
    }

    const metadata = await getGroupMetadataCached(sock, remoteJid)
    const participants = metadata?.participants || []

    if (participants.length === 0) {
      logCommandExecution('tag', ctx, false, { reason: 'no_participants' })
      return errorResponse('⚠️ No se pudo obtener la lista de miembros.', {
        command: 'tag',
        reason: 'no_participants',
      })
    }

    const mentions = participants.map((p) => p.id)
    const text = (Array.isArray(args) && args.join(' ').trim()) || '📢 ¡Atención a todos!'

    const executorInfo = extractUserInfo(sender)
    logger.info(
      {
        scope: 'command',
        command: 'tag',
        executor: executorInfo.number,
        mentionCount: mentions.length,
        group: remoteJid,
      },
      `📢 Tag enviado a ${mentions.length} miembros por ${executorInfo.mention}`
    )

    logCommandExecution('tag', ctx, true, {
      executor: executorInfo.number,
      mentionCount: mentions.length,
    })

    return successResponse(text, {
      mentions,
      metadata: {
        executor: executorInfo.number,
        mentionCount: mentions.length,
      },
    })
  } catch (e) {
    logCommandError('tag', ctx, e)
    return errorResponse('⚠️ Error al enviar tag. Intenta de nuevo.', {
      command: 'tag',
      error: e.message,
    })
  }
}

/**
 * Lista los administradores del grupo
 */
export async function admins(ctx) {
  try {
    const { remoteJid, sock, isGroup } = ctx

    if (!isGroup) {
      return errorResponse('❌ Este comando solo funciona en grupos.', {
        command: 'admins',
        reason: 'not_in_group',
      })
    }

    const metadata = await getGroupMetadataCached(sock, remoteJid)
    const admins = (metadata?.participants || []).filter(
      (p) => p.admin === 'admin' || p.admin === 'superadmin' || p.admin === 'owner'
    )

    if (admins.length === 0) {
      logCommandExecution('admins', ctx, true, { adminCount: 0 })
      return successResponse('ℹ️ No hay administradores en este grupo.', {
        metadata: { adminCount: 0 },
      })
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
      {
        scope: 'command',
        command: 'admins',
        group: remoteJid,
        adminCount: admins.length,
      },
      `👑 Lista de administradores consultada | Total: ${admins.length}`
    )

    logCommandExecution('admins', ctx, true, { adminCount: admins.length })

    return successResponse(message, {
      mentions,
      metadata: {
        adminCount: admins.length,
        admins: admins.map((a) => ({
          jid: a.id,
          role: a.admin,
        })),
      },
    })
  } catch (e) {
    logCommandError('admins', ctx, e)
    return errorResponse('⚠️ Error al obtener lista de administradores.', {
      command: 'admins',
      error: e.message,
    })
  }
}

/**
 * Habilita el bot en el grupo
 */
export async function addGroup(ctx) {
  try {
    const { isGroup, remoteJid, sock, sender } = ctx

    if (!isGroup) {
      return errorResponse('❌ Este comando solo funciona en grupos.', {
        command: 'addgroup',
        reason: 'not_in_group',
      })
    }

    const { isAdmin } = await getGroupRoles(sock, remoteJid, sender)

    if (!isAdmin) {
      logCommandExecution('addgroup', ctx, false, { reason: 'not_admin' })
      return errorResponse('🚫 Solo los administradores pueden usar este comando.', {
        command: 'addgroup',
        reason: 'not_admin',
      })
    }

    await ensureGroupsTable()

    const existing = await db('grupos_autorizados').where({ jid: remoteJid }).first()

    if (existing) {
      await db('grupos_autorizados').where({ jid: remoteJid }).update({ bot_enabled: true })
    } else {
      await db('grupos_autorizados').insert({
        jid: remoteJid,
        bot_enabled: true,
        tipo: 'general',
      })
    }

    const executorInfo = extractUserInfo(sender)
    logger.info(
      {
        scope: 'command',
        command: 'addgroup',
        executor: executorInfo.number,
        group: remoteJid,
      },
      `✅ Bot habilitado en grupo por ${executorInfo.mention}`
    )

    logCommandExecution('addgroup', ctx, true, { executor: executorInfo.number })

    return successResponse('✅ Bot habilitado en este grupo.', {
      metadata: { executor: executorInfo.number },
    })
  } catch (e) {
    logCommandError('addgroup', ctx, e)
    return errorResponse('���️ Error al habilitar el bot. Intenta de nuevo.', {
      command: 'addgroup',
      error: e.message,
    })
  }
}

/**
 * Desactiva el bot en el grupo
 */
export async function delGroup(ctx) {
  try {
    const { isGroup, remoteJid, sock, sender } = ctx

    if (!isGroup) {
      return errorResponse('❌ Este comando solo funciona en grupos.', {
        command: 'delgroup',
        reason: 'not_in_group',
      })
    }

    const { isAdmin } = await getGroupRoles(sock, remoteJid, sender)

    if (!isAdmin) {
      logCommandExecution('delgroup', ctx, false, { reason: 'not_admin' })
      return errorResponse('🚫 Solo los administradores pueden usar este comando.', {
        command: 'delgroup',
        reason: 'not_admin',
      })
    }

    await ensureGroupsTable()
    await db('grupos_autorizados').where({ jid: remoteJid }).update({ bot_enabled: false })

    const executorInfo = extractUserInfo(sender)
    logger.info(
      {
        scope: 'command',
        command: 'delgroup',
        executor: executorInfo.number,
        group: remoteJid,
      },
      `🚫 Bot deshabilitado en grupo por ${executorInfo.mention}`
    )

    logCommandExecution('delgroup', ctx, true, { executor: executorInfo.number })

    return successResponse('🚫 Bot deshabilitado en este grupo.', {
      metadata: { executor: executorInfo.number },
    })
  } catch (e) {
    logCommandError('delgroup', ctx, e)
    return errorResponse('⚠️ Error al desactivar el bot. Intenta de nuevo.', {
      command: 'delgroup',
      error: e.message,
    })
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

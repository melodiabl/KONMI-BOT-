// commands/moderation.js
// Sistema de advertencias por grupo con logging mejorado y metadata real

import logger from '../config/logger.js'
import db from '../database/db.js'
import { getGroupRoles } from '../utils/utils/group-helper.js'
import {
  extractTargetJid,
  onlyDigits,
  successResponse,
  errorResponse,
  logCommandExecution,
  logCommandError,
  validateAdminPermission,
  extractUserInfo,
  formatUserList,
} from '../utils/command-helpers.js'

let warningsTableInitialized = false

/**
 * Asegura que la tabla de advertencias existe
 */
async function ensureWarningsTable() {
  if (warningsTableInitialized) return

  try {
    const exists = await db.schema.hasTable('group_warnings')
    if (!exists) {
      await db.schema.createTable('group_warnings', (t) => {
        t.increments('id')
        t.string('group_id').notNullable()
        t.string('user_jid').notNullable()
        t.integer('count').defaultTo(1)
        t.timestamp('created_at').defaultTo(db.fn.now())
        t.timestamp('updated_at').defaultTo(db.fn.now())
        t.unique(['group_id', 'user_jid'])
      })
      logger.info(
        { scope: 'database', table: 'group_warnings' },
        '✅ Tabla group_warnings creada exitosamente'
      )
    }
    warningsTableInitialized = true
  } catch (e) {
    logger.error(
      { scope: 'database', table: 'group_warnings', error: e.message },
      `❌ Error al crear tabla group_warnings: ${e.message}`
    )
    throw e
  }
}

/**
 * Aplica una advertencia a un usuario
 */
export async function warn(ctx) {
  try {
    const { remoteJid, sender } = ctx

    // Validar permisos
    const permCheck = await validateAdminPermission(ctx, 'warn')
    if (!permCheck.allowed) {
      return permCheck.response
    }

    // Extraer usuario objetivo
    const targetJid = extractTargetJid(ctx)
    if (!targetJid) {
      logCommandExecution('warn', ctx, false, { reason: 'no_target' })
      return errorResponse('❌ Uso: /warn @usuario o responde a un mensaje con /warn.', {
        command: 'warn',
        reason: 'no_target',
      })
    }

    if (targetJid === sender) {
      logCommandExecution('warn', ctx, false, { reason: 'self_warn' })
      return errorResponse('🚫 No puedes advertirte a ti mismo.', {
        command: 'warn',
        reason: 'self_warn',
      })
    }

    await ensureWarningsTable()

    const userKey = onlyDigits(targetJid)
    const userInfo = extractUserInfo(targetJid)

    // Buscar advertencia existente
    const row = await db('group_warnings')
      .where({ group_id: remoteJid })
      .andWhere((q) => {
        if (userKey) {
          q.where('user_jid', userKey).orWhere('user_jid', targetJid)
        } else {
          q.where('user_jid', targetJid)
        }
      })
      .first()

    let newCount = 1
    if (row) {
      newCount = row.count + 1
      await db('group_warnings')
        .where({ id: row.id })
        .update({ count: newCount, updated_at: db.fn.now() })
    } else {
      await db('group_warnings').insert({
        group_id: remoteJid,
        user_jid: userKey || targetJid,
        count: 1,
      })
    }

    const executor = extractUserInfo(sender)
    logger.info(
      {
        scope: 'command',
        command: 'warn',
        target: userInfo.number,
        executor: executor.number,
        warningCount: newCount,
        group: remoteJid,
      },
      `⚠️ Advertencia aplicada a ${userInfo.mention} | Total: ${newCount} | Por: ${executor.mention}`
    )

    logCommandExecution('warn', ctx, true, {
      target: userInfo.number,
      warningCount: newCount,
    })

    return successResponse(
      `⚠️ Advertencia para ${userInfo.mention}. Este usuario ahora tiene ${newCount} advertencia(s).`,
      {
        mentions: [targetJid],
        metadata: {
          target: userInfo.number,
          warningCount: newCount,
          executor: executor.number,
        },
      }
    )
  } catch (e) {
    logCommandError('warn', ctx, e)
    return errorResponse('⚠️ Error al aplicar la advertencia. Intenta de nuevo.', {
      command: 'warn',
      error: e.message,
    })
  }
}

/**
 * Elimina todas las advertencias de un usuario
 */
export async function unwarn(ctx) {
  try {
    const { remoteJid, sender } = ctx

    // Validar permisos
    const permCheck = await validateAdminPermission(ctx, 'unwarn')
    if (!permCheck.allowed) {
      return permCheck.response
    }

    // Extraer usuario objetivo
    const targetJid = extractTargetJid(ctx)
    if (!targetJid) {
      logCommandExecution('unwarn', ctx, false, { reason: 'no_target' })
      return errorResponse('❌ Uso: /unwarn @usuario o responde a un mensaje con /unwarn.', {
        command: 'unwarn',
        reason: 'no_target',
      })
    }

    await ensureWarningsTable()

    const userKey = onlyDigits(targetJid)
    const userInfo = extractUserInfo(targetJid)

    // Eliminar advertencias
    const deleted = await db('group_warnings')
      .where({ group_id: remoteJid })
      .andWhere((q) => {
        if (userKey) {
          q.where('user_jid', userKey).orWhere('user_jid', targetJid)
        } else {
          q.where('user_jid', targetJid)
        }
      })
      .del()

    if (deleted === 0) {
      logCommandExecution('unwarn', ctx, false, { reason: 'no_warnings', target: userInfo.number })
      return errorResponse(`❌ ${userInfo.mention} no tenía advertencias registradas.`, {
        command: 'unwarn',
        reason: 'no_warnings',
        target: userInfo.number,
        mentions: [targetJid],
      })
    }

    const executor = extractUserInfo(sender)
    logger.info(
      {
        scope: 'command',
        command: 'unwarn',
        target: userInfo.number,
        executor: executor.number,
        warningsRemoved: deleted,
        group: remoteJid,
      },
      `✅ Advertencias eliminadas para ${userInfo.mention} (${deleted}) | Por: ${executor.mention}`
    )

    logCommandExecution('unwarn', ctx, true, {
      target: userInfo.number,
      warningsRemoved: deleted,
    })

    return successResponse(`✅ Se han eliminado todas las advertencias para ${userInfo.mention}.`, {
      mentions: [targetJid],
      metadata: {
        target: userInfo.number,
        warningsRemoved: deleted,
        executor: executor.number,
      },
    })
  } catch (e) {
    logCommandError('unwarn', ctx, e)
    return errorResponse('⚠️ Error al quitar las advertencias. Intenta de nuevo.', {
      command: 'unwarn',
      error: e.message,
    })
  }
}

/**
 * Lista todas las advertencias del grupo
 */
export async function warns(ctx) {
  try {
    const { remoteJid, isGroup } = ctx

    if (!isGroup) {
      return errorResponse('❌ Este comando solo funciona en grupos.', {
        command: 'warns',
        reason: 'not_in_group',
      })
    }

    await ensureWarningsTable()

    const rows = await db('group_warnings')
      .where({ group_id: remoteJid })
      .orderBy('count', 'desc')
      .limit(50)

    if (!rows || rows.length === 0) {
      logCommandExecution('warns', ctx, true, { warningCount: 0 })
      return successResponse('✅ No hay advertencias registradas en este grupo.', {
        metadata: { warningCount: 0 },
      })
    }

    const mentions = rows
      .map((r) => r.user_jid)
      .filter((jid) => jid && (jid.includes('@') || /^\d+$/.test(jid)))

    const list = rows
      .map((r, i) => {
        const userInfo = extractUserInfo(r.user_jid)
        const warningText = r.count === 1 ? 'advertencia' : 'advertencias'
        return `${i + 1}. ${userInfo.mention} - ${r.count} ${warningText}`
      })
      .join('\n')

    const message = `📋 *Advertencias en este grupo*\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n${list}\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n📊 Total: ${rows.length} usuario(s) con advertencias`

    logger.info(
      {
        scope: 'command',
        command: 'warns',
        group: remoteJid,
        warningCount: rows.length,
      },
      `📋 Lista de advertencias consultada | Total: ${rows.length}`
    )

    logCommandExecution('warns', ctx, true, { warningCount: rows.length })

    return successResponse(message, {
      mentions,
      metadata: {
        warningCount: rows.length,
        warnings: rows.map((r) => ({
          user: r.user_jid,
          count: r.count,
          createdAt: r.created_at,
          updatedAt: r.updated_at,
        })),
      },
    })
  } catch (e) {
    logCommandError('warns', ctx, e)
    return errorResponse('⚠️ Error al obtener la lista de advertencias. Intenta de nuevo.', {
      command: 'warns',
      error: e.message,
    })
  }
}

/**
 * Obtiene advertencias de un usuario específico
 */
export async function userWarnings(ctx) {
  try {
    const { remoteJid, isGroup } = ctx

    if (!isGroup) {
      return errorResponse('❌ Este comando solo funciona en grupos.', {
        command: 'userwarnings',
        reason: 'not_in_group',
      })
    }

    const targetJid = extractTargetJid(ctx)
    if (!targetJid) {
      return errorResponse('❌ Uso: /userwarnings @usuario o responde a un mensaje.', {
        command: 'userwarnings',
        reason: 'no_target',
      })
    }

    await ensureWarningsTable()

    const userKey = onlyDigits(targetJid)
    const userInfo = extractUserInfo(targetJid)

    const row = await db('group_warnings')
      .where({ group_id: remoteJid })
      .andWhere((q) => {
        if (userKey) {
          q.where('user_jid', userKey).orWhere('user_jid', targetJid)
        } else {
          q.where('user_jid', targetJid)
        }
      })
      .first()

    if (!row) {
      logCommandExecution('userwarnings', ctx, true, {
        target: userInfo.number,
        warningCount: 0,
      })
      return successResponse(`✅ ${userInfo.mention} no tiene advertencias.`, {
        mentions: [targetJid],
        metadata: {
          target: userInfo.number,
          warningCount: 0,
        },
      })
    }

    const warningText = row.count === 1 ? 'advertencia' : 'advertencias'
    const message = `⚠️ ${userInfo.mention} tiene ${row.count} ${warningText}\n📅 Última actualización: ${new Date(row.updated_at).toLocaleString()}`

    logCommandExecution('userwarnings', ctx, true, {
      target: userInfo.number,
      warningCount: row.count,
    })

    return successResponse(message, {
      mentions: [targetJid],
      metadata: {
        target: userInfo.number,
        warningCount: row.count,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      },
    })
  } catch (e) {
    logCommandError('userwarnings', ctx, e)
    return errorResponse('⚠️ Error al obtener advertencias del usuario.', {
      command: 'userwarnings',
      error: e.message,
    })
  }
}

export default { warn, unwarn, warns, userWarnings }

// commands/moderation.js
// Sistema de advertencias con context-builder

import logger from '../config/logger.js'
import db from '../database/db.js'
import { buildCommandContext, validateAdminInGroup, logContext } from '../utils/context-builder.js'
import {
  extractTargetJid,
  onlyDigits,
  successResponse,
  errorResponse,
  logCommandExecution,
  logCommandError,
  extractUserInfo,
} from '../utils/command-helpers.js'

let warningsTableInitialized = false

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
      logger.info({ scope: 'database', table: 'group_warnings' }, '✅ Tabla group_warnings creada')
    }
    warningsTableInitialized = true
  } catch (e) {
    logger.error({ scope: 'database', table: 'group_warnings', error: e.message }, `❌ Error creando tabla: ${e.message}`)
    throw e
  }
}

export async function warn(ctx) {
  try {
    const fullCtx = await buildCommandContext(ctx.sock, ctx.message, ctx.remoteJid, ctx.sender, ctx.pushName)
    logContext(fullCtx, 'warn_command')

    const adminCheck = await validateAdminInGroup(fullCtx)
    if (!adminCheck.valid) {
      logCommandExecution('warn', fullCtx, false, { reason: adminCheck.reason })
      return errorResponse(adminCheck.message, { command: 'warn', reason: adminCheck.reason })
    }

    const targetJid = extractTargetJid(fullCtx)
    if (!targetJid) {
      logCommandExecution('warn', fullCtx, false, { reason: 'no_target' })
      return errorResponse('❌ Uso: /warn @usuario o responde a un mensaje con /warn.', { command: 'warn', reason: 'no_target' })
    }

    if (targetJid === fullCtx.sender) {
      logCommandExecution('warn', fullCtx, false, { reason: 'self_warn' })
      return errorResponse('🚫 No puedes advertirte a ti mismo.', { command: 'warn', reason: 'self_warn' })
    }

    await ensureWarningsTable()

    const userKey = onlyDigits(targetJid)
    const userInfo = extractUserInfo(targetJid)

    const row = await db('group_warnings')
      .where({ group_id: fullCtx.remoteJid })
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
        group_id: fullCtx.remoteJid,
        user_jid: userKey || targetJid,
        count: 1,
      })
    }

    const executor = extractUserInfo(fullCtx.sender)
    logger.info(
      { scope: 'command', command: 'warn', target: userInfo.number, executor: executor.number, warningCount: newCount, group: fullCtx.remoteJid },
      `⚠️ Advertencia a ${userInfo.mention} | Total: ${newCount} | Por: ${executor.mention}`
    )

    logCommandExecution('warn', fullCtx, true, { target: userInfo.number, warningCount: newCount })

    return successResponse(`⚠️ Advertencia para ${userInfo.mention}. Este usuario ahora tiene ${newCount} advertencia(s).`, {
      mentions: [targetJid],
      metadata: { target: userInfo.number, warningCount: newCount, executor: executor.number },
    })
  } catch (e) {
    logCommandError('warn', ctx, e)
    return errorResponse('⚠️ Error al aplicar advertencia.', { command: 'warn', error: e.message })
  }
}

export async function unwarn(ctx) {
  try {
    const fullCtx = await buildCommandContext(ctx.sock, ctx.message, ctx.remoteJid, ctx.sender, ctx.pushName)
    logContext(fullCtx, 'unwarn_command')

    const adminCheck = await validateAdminInGroup(fullCtx)
    if (!adminCheck.valid) {
      logCommandExecution('unwarn', fullCtx, false, { reason: adminCheck.reason })
      return errorResponse(adminCheck.message, { command: 'unwarn', reason: adminCheck.reason })
    }

    const targetJid = extractTargetJid(fullCtx)
    if (!targetJid) {
      logCommandExecution('unwarn', fullCtx, false, { reason: 'no_target' })
      return errorResponse('❌ Uso: /unwarn @usuario o responde a un mensaje con /unwarn.', { command: 'unwarn', reason: 'no_target' })
    }

    await ensureWarningsTable()

    const userKey = onlyDigits(targetJid)
    const userInfo = extractUserInfo(targetJid)

    const deleted = await db('group_warnings')
      .where({ group_id: fullCtx.remoteJid })
      .andWhere((q) => {
        if (userKey) {
          q.where('user_jid', userKey).orWhere('user_jid', targetJid)
        } else {
          q.where('user_jid', targetJid)
        }
      })
      .del()

    if (deleted === 0) {
      logCommandExecution('unwarn', fullCtx, false, { reason: 'no_warnings', target: userInfo.number })
      return errorResponse(`❌ ${userInfo.mention} no tenía advertencias registradas.`, { command: 'unwarn', reason: 'no_warnings', target: userInfo.number, mentions: [targetJid] })
    }

    const executor = extractUserInfo(fullCtx.sender)
    logger.info(
      { scope: 'command', command: 'unwarn', target: userInfo.number, executor: executor.number, warningsRemoved: deleted, group: fullCtx.remoteJid },
      `✅ Advertencias eliminadas para ${userInfo.mention} (${deleted}) | Por: ${executor.mention}`
    )

    logCommandExecution('unwarn', fullCtx, true, { target: userInfo.number, warningsRemoved: deleted })

    return successResponse(`✅ Se han eliminado todas las advertencias para ${userInfo.mention}.`, {
      mentions: [targetJid],
      metadata: { target: userInfo.number, warningsRemoved: deleted, executor: executor.number },
    })
  } catch (e) {
    logCommandError('unwarn', ctx, e)
    return errorResponse('⚠️ Error al quitar advertencias.', { command: 'unwarn', error: e.message })
  }
}

export async function warns(ctx) {
  try {
    const fullCtx = await buildCommandContext(ctx.sock, ctx.message, ctx.remoteJid, ctx.sender, ctx.pushName)
    logContext(fullCtx, 'warns_command')

    if (!fullCtx.isGroup) {
      return errorResponse('❌ Este comando solo funciona en grupos.', { command: 'warns', reason: 'not_in_group' })
    }

    await ensureWarningsTable()

    const rows = await db('group_warnings')
      .where({ group_id: fullCtx.remoteJid })
      .orderBy('count', 'desc')
      .limit(50)

    if (!rows || rows.length === 0) {
      logCommandExecution('warns', fullCtx, true, { warningCount: 0 })
      return successResponse('✅ No hay advertencias registradas en este grupo.', { metadata: { warningCount: 0 } })
    }

    const mentions = rows.map((r) => r.user_jid).filter((jid) => jid && (jid.includes('@') || /^\d+$/.test(jid)))

    const list = rows
      .map((r, i) => {
        const userInfo = extractUserInfo(r.user_jid)
        const warningText = r.count === 1 ? 'advertencia' : 'advertencias'
        return `${i + 1}. ${userInfo.mention} - ${r.count} ${warningText}`
      })
      .join('\n')

    const message = `📋 *Advertencias en este grupo*\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n${list}\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n📊 Total: ${rows.length} usuario(s) con advertencias`

    logger.info(
      { scope: 'command', command: 'warns', group: fullCtx.remoteJid, warningCount: rows.length },
      `📋 Lista de advertencias consultada | Total: ${rows.length}`
    )

    logCommandExecution('warns', fullCtx, true, { warningCount: rows.length })

    return successResponse(message, {
      mentions,
      metadata: {
        warningCount: rows.length,
        warnings: rows.map((r) => ({ user: r.user_jid, count: r.count, createdAt: r.created_at, updatedAt: r.updated_at })),
      },
    })
  } catch (e) {
    logCommandError('warns', ctx, e)
    return errorResponse('⚠️ Error al obtener lista de advertencias.', { command: 'warns', error: e.message })
  }
}

export async function userWarnings(ctx) {
  try {
    const fullCtx = await buildCommandContext(ctx.sock, ctx.message, ctx.remoteJid, ctx.sender, ctx.pushName)
    logContext(fullCtx, 'userwarnings_command')

    if (!fullCtx.isGroup) {
      return errorResponse('❌ Este comando solo funciona en grupos.', { command: 'userwarnings', reason: 'not_in_group' })
    }

    const targetJid = extractTargetJid(fullCtx)
    if (!targetJid) {
      return errorResponse('❌ Uso: /userwarnings @usuario o responde a un mensaje.', { command: 'userwarnings', reason: 'no_target' })
    }

    await ensureWarningsTable()

    const userKey = onlyDigits(targetJid)
    const userInfo = extractUserInfo(targetJid)

    const row = await db('group_warnings')
      .where({ group_id: fullCtx.remoteJid })
      .andWhere((q) => {
        if (userKey) {
          q.where('user_jid', userKey).orWhere('user_jid', targetJid)
        } else {
          q.where('user_jid', targetJid)
        }
      })
      .first()

    if (!row) {
      logCommandExecution('userwarnings', fullCtx, true, { target: userInfo.number, warningCount: 0 })
      return successResponse(`✅ ${userInfo.mention} no tiene advertencias.`, {
        mentions: [targetJid],
        metadata: { target: userInfo.number, warningCount: 0 },
      })
    }

    const warningText = row.count === 1 ? 'advertencia' : 'advertencias'
    const message = `⚠️ ${userInfo.mention} tiene ${row.count} ${warningText}\n📅 Última actualización: ${new Date(row.updated_at).toLocaleString()}`

    logCommandExecution('userwarnings', fullCtx, true, { target: userInfo.number, warningCount: row.count })

    return successResponse(message, {
      mentions: [targetJid],
      metadata: { target: userInfo.number, warningCount: row.count, createdAt: row.created_at, updatedAt: row.updated_at },
    })
  } catch (e) {
    logCommandError('userwarnings', ctx, e)
    return errorResponse('⚠️ Error al obtener advertencias del usuario.', { command: 'userwarnings', error: e.message })
  }
}

export default { warn, unwarn, warns, userWarnings }

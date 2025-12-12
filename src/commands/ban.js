// commands/ban.js
// Sistema de ban por grupo con context-builder mejorado

import logger from '../config/logger.js'
import db from '../database/db.js'
import { buildCommandContext, validateAdminInGroup, validateBotAdminInGroup, logContext } from '../utils/context-builder.js'
import { successResponse, errorResponse, logCommandExecution, logCommandError, extractUserInfo, extractTargetJid, onlyDigits } from '../utils/command-helpers.js'

let bansTableInitialized = false

async function ensureBansTable() {
  if (bansTableInitialized) return

  try {
    const exists = await db.schema.hasTable('group_bans')
    if (!exists) {
      await db.schema.createTable('group_bans', (t) => {
        t.increments('id')
        t.string('group_id').notNullable()
        t.string('user_jid').notNullable()
        t.timestamp('created_at').defaultTo(db.fn.now())
        t.unique(['group_id', 'user_jid'])
      })
      logger.info({ scope: 'database', table: 'group_bans' }, '✅ Tabla group_bans creada')
    }
    bansTableInitialized = true
  } catch (e) {
    logger.error({ scope: 'database', table: 'group_bans', error: e.message }, `❌ Error creando tabla: ${e.message}`)
    throw e
  }
}

export async function ban(ctx) {
  try {
    const fullCtx = await buildCommandContext(ctx.sock, ctx.message, ctx.remoteJid, ctx.sender, ctx.pushName)
    logContext(fullCtx, 'ban_command')

    const adminCheck = await validateAdminInGroup(fullCtx)
    if (!adminCheck.valid) {
      logCommandExecution('ban', fullCtx, false, { reason: adminCheck.reason })
      return errorResponse(adminCheck.message, { command: 'ban', reason: adminCheck.reason })
    }

    const botAdminCheck = await validateBotAdminInGroup(fullCtx)
    if (!botAdminCheck.valid) {
      logCommandExecution('ban', fullCtx, false, { reason: botAdminCheck.reason })
      return errorResponse(botAdminCheck.message, { command: 'ban', reason: botAdminCheck.reason })
    }

    const targetJid = extractTargetJid(fullCtx)
    if (!targetJid) {
      logCommandExecution('ban', fullCtx, false, { reason: 'no_target' })
      return errorResponse('❌ Uso: /ban @usuario o responde a un mensaje con /ban.', { command: 'ban', reason: 'no_target' })
    }

    if (targetJid === fullCtx.sender) {
      logCommandExecution('ban', fullCtx, false, { reason: 'self_ban' })
      return errorResponse('🚫 No puedes banearte a ti mismo.', { command: 'ban', reason: 'self_ban' })
    }

    await ensureBansTable()

    const userKey = onlyDigits(targetJid)
    await db('group_bans')
      .insert({ group_id: fullCtx.remoteJid, user_jid: userKey || targetJid })
      .onConflict(['group_id', 'user_jid'])
      .ignore()

    const targetInfo = extractUserInfo(targetJid)
    const executorInfo = extractUserInfo(fullCtx.sender)

    logger.info(
      { scope: 'command', command: 'ban', target: targetInfo.number, executor: executorInfo.number, group: fullCtx.remoteJid },
      `✅ Usuario ${targetInfo.mention} baneado por ${executorInfo.mention}`
    )

    logCommandExecution('ban', fullCtx, true, { target: targetInfo.number })

    return successResponse(`✅ Usuario ${targetInfo.mention} ha sido baneado del uso del bot en este grupo.`, {
      mentions: [targetJid],
      metadata: { target: targetInfo.number, executor: executorInfo.number },
    })
  } catch (e) {
    logCommandError('ban', ctx, e)
    return errorResponse('⚠️ Error al banear. Intenta de nuevo.', { command: 'ban', error: e.message })
  }
}

export async function unban(ctx) {
  try {
    const fullCtx = await buildCommandContext(ctx.sock, ctx.message, ctx.remoteJid, ctx.sender, ctx.pushName)
    logContext(fullCtx, 'unban_command')

    const adminCheck = await validateAdminInGroup(fullCtx)
    if (!adminCheck.valid) {
      logCommandExecution('unban', fullCtx, false, { reason: adminCheck.reason })
      return errorResponse(adminCheck.message, { command: 'unban', reason: adminCheck.reason })
    }

    const targetJid = extractTargetJid(fullCtx)
    if (!targetJid) {
      logCommandExecution('unban', fullCtx, false, { reason: 'no_target' })
      return errorResponse('❌ Uso: /unban @usuario o responde a un mensaje con /unban.', { command: 'unban', reason: 'no_target' })
    }

    await ensureBansTable()

    const userKey = onlyDigits(targetJid)
    const deleted = await db('group_bans')
      .where({ group_id: fullCtx.remoteJid })
      .andWhere((q) => {
        if (userKey) {
          q.where('user_jid', userKey).orWhere('user_jid', targetJid)
        } else {
          q.where('user_jid', targetJid)
        }
      })
      .del()

    if (!deleted) {
      const targetInfo = extractUserInfo(targetJid)
      logCommandExecution('unban', fullCtx, false, { reason: 'not_banned', target: targetInfo.number })
      return errorResponse(`❌ ${targetInfo.mention} no estaba baneado en este grupo.`, { command: 'unban', reason: 'not_banned', mentions: [targetJid] })
    }

    const targetInfo = extractUserInfo(targetJid)
    const executorInfo = extractUserInfo(fullCtx.sender)

    logger.info(
      { scope: 'command', command: 'unban', target: targetInfo.number, executor: executorInfo.number, group: fullCtx.remoteJid },
      `✅ Usuario ${targetInfo.mention} desbaneado por ${executorInfo.mention}`
    )

    logCommandExecution('unban', fullCtx, true, { target: targetInfo.number })

    return successResponse(`✅ Usuario ${targetInfo.mention} ha sido desbaneado del uso del bot en este grupo.`, {
      mentions: [targetJid],
      metadata: { target: targetInfo.number, executor: executorInfo.number },
    })
  } catch (e) {
    logCommandError('unban', ctx, e)
    return errorResponse('⚠️ Error al desbanear. Intenta de nuevo.', { command: 'unban', error: e.message })
  }
}

export async function bans(ctx) {
  try {
    const fullCtx = await buildCommandContext(ctx.sock, ctx.message, ctx.remoteJid, ctx.sender, ctx.pushName)
    logContext(fullCtx, 'bans_command')

    if (!fullCtx.isGroup) {
      return errorResponse('❌ Este comando solo funciona en grupos.', { command: 'bans', reason: 'not_in_group' })
    }

    await ensureBansTable()

    const rows = await db('group_bans').where({ group_id: fullCtx.remoteJid }).orderBy('created_at', 'asc')

    if (!rows || rows.length === 0) {
      logCommandExecution('bans', fullCtx, true, { count: 0 })
      return successResponse('✅ No hay usuarios baneados en este grupo.', { metadata: { count: 0 } })
    }

    const lines = rows.map((r, i) => {
      const num = (r.user_jid || '').split('@')[0] || 'desconocido'
      return `${i + 1}. @${num}`
    })

    const mentions = rows.map((r) => r.user_jid).filter((jid) => jid && (jid.includes('@') || /^\d+$/.test(jid)))

    const text = `📋 *Usuarios baneados del bot en este grupo*\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n${lines.join('\n')}\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n📊 Total: ${rows.length}`

    logger.info({ scope: 'command', command: 'bans', group: fullCtx.remoteJid, count: rows.length }, `📋 Lista de baneados consultada | Total: ${rows.length}`)

    logCommandExecution('bans', fullCtx, true, { count: rows.length })

    return successResponse(text, { mentions, metadata: { count: rows.length } })
  } catch (e) {
    logCommandError('bans', ctx, e)
    return errorResponse('⚠️ Error al obtener lista de baneados.', { command: 'bans', error: e.message })
  }
}

export default { ban, unban, bans }

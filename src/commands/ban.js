// commands/ban.js – Sistema sencillo de ban por grupo

import db from '../database/db.js'

const onlyDigits = (v) => String(v || '').replace(/\D/g, '')

async function ensureBansTable() {
  const exists = await db.schema.hasTable('group_bans')
  if (!exists) {
    await db.schema.createTable('group_bans', (t) => {
      t.increments('id')
      t.string('group_id').notNullable()
      t.string('user_jid').notNullable()
      t.timestamp('created_at').defaultTo(db.fn.now())
      t.unique(['group_id', 'user_jid'])
    })
  }
}

function extractTargetJid(ctx) {
  const { message, args } = ctx
  const quoted = message?.message?.extendedTextMessage?.contextInfo

  if (quoted?.mentionedJid?.length > 0) {
    return quoted.mentionedJid[0]
  }
  if (quoted?.participant) {
    return quoted.participant
  }
  if (Array.isArray(args) && args.length > 0) {
    const mention = String(args[0] || '').replace('@', '')
    const digits = onlyDigits(mention)
    if (digits) return `${digits}@s.whatsapp.net`
  }
  return null
}

export async function ban(ctx) {
  const { isGroup, isAdmin, isOwner, remoteJid, sender } = ctx

  if (!isGroup) {
    return { success: false, message: 'ℹ️ Este comando solo funciona en grupos.' }
  }
  if (!isAdmin && !isOwner) {
    return { success: false, message: '⛔ Solo los administradores o el owner pueden banear usuarios del bot.' }
  }

  const targetJid = extractTargetJid(ctx)
  if (!targetJid) {
    return {
      success: false,
      message: 'ℹ️ Uso: /ban @usuario o responde a un mensaje con /ban.'
    }
  }

  if (targetJid === sender) {
    return { success: false, message: '⛔ No puedes banearte a ti mismo.' }
  }

  await ensureBansTable()

  try {
    const userKey = onlyDigits(targetJid)
    await db('group_bans')
      .insert({ group_id: remoteJid, user_jid: userKey || targetJid })
      .onConflict(['group_id', 'user_jid'])
      .ignore()

    return {
      success: true,
      message: `🚫 Usuario @${targetJid.split('@')[0]} ha sido baneado del uso del bot en este grupo.`,
      mentions: [targetJid]
    }
  } catch (e) {
    console.error('Error en /ban:', e)
    return { success: false, message: '⚠️ Ocurrió un error al banear al usuario.' }
  }
}

export async function unban(ctx) {
  const { isGroup, isAdmin, isOwner, remoteJid } = ctx

  if (!isGroup) {
    return { success: false, message: 'ℹ️ Este comando solo funciona en grupos.' }
  }
  if (!isAdmin && !isOwner) {
    return { success: false, message: '⛔ Solo los administradores o el owner pueden desbanear usuarios del bot.' }
  }

  const targetJid = extractTargetJid(ctx)
  if (!targetJid) {
    return {
      success: false,
      message: 'ℹ️ Uso: /unban @usuario o responde a un mensaje con /unban.'
    }
  }

  await ensureBansTable()

  try {
    const userKey = onlyDigits(targetJid)
    const deleted = await db('group_bans')
      .where({ group_id: remoteJid })
      .andWhere(q => {
        if (userKey) {
          q.where('user_jid', userKey).orWhere('user_jid', targetJid)
        } else {
          q.where('user_jid', targetJid)
        }
      })
      .del()

    if (!deleted) {
      return {
        success: false,
        message: `ℹ️ El usuario @${targetJid.split('@')[0]} no estaba baneado en este grupo.`,
        mentions: [targetJid]
      }
    }

    return {
      success: true,
      message: `✅ Usuario @${targetJid.split('@')[0]} ha sido desbaneado del uso del bot en este grupo.`,
      mentions: [targetJid]
    }
  } catch (e) {
    console.error('Error en /unban:', e)
    return { success: false, message: '⚠️ Ocurrió un error al desbanear al usuario.' }
  }
}

export async function bans(ctx) {
  const { isGroup, isAdmin, isOwner, remoteJid } = ctx

  if (!isGroup) {
    return { success: false, message: 'ℹ️ Este comando solo funciona en grupos.' }
  }
  if (!isAdmin && !isOwner) {
    return { success: false, message: '⛔ Solo los administradores o el owner pueden ver la lista de baneados.' }
  }

  await ensureBansTable()

  try {
    const rows = await db('group_bans')
      .where({ group_id: remoteJid })
      .orderBy('created_at', 'asc')

    if (!rows.length) {
      return { success: true, message: 'ℹ️ No hay usuarios baneados en este grupo.' }
    }

    const lines = rows.map((r, i) => {
      const num = (r.user_jid || '').split('@')[0] || 'desconocido'
      return `${i + 1}. @${num}`
    })

    const mentions = rows.map(r => r.user_jid)
    const text = `🚫 *Usuarios baneados del bot en este grupo*\n\n${lines.join('\n')}`

    return { success: true, message: text, mentions }
  } catch (e) {
    console.error('Error en /bans:', e)
    return { success: false, message: '⚠️ Ocurrió un error al obtener la lista de baneados.' }
  }
}

export default { ban, unban, bans }

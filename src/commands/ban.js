// src/commands/ban.js
import db from '../database/db.js'
import { getGroupRoles } from '../utils/utils/group-helper.js'

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

async function ban(ctx) {
  const { isGroup, isOwner, remoteJid, sender, sock } = ctx
  if (!isGroup) {
    return { text: '❌ Este comando solo funciona en grupos.' }
  }
  let isAdmin = !!ctx.isAdmin
  if (!isAdmin && sock && remoteJid && sender) {
    try {
      const roles = await getGroupRoles(sock, remoteJid, sender)
      isAdmin = roles.isAdmin
    } catch (e) {}
  }
  if (!isAdmin && !isOwner) {
    return { text: '🚫 Solo los administradores o el owner pueden banear usuarios del bot.' }
  }
  const targetJid = extractTargetJid(ctx)
  if (!targetJid) {
    return { text: '❌ Uso: /ban @usuario o responde a un mensaje con /ban.' }
  }
  if (targetJid === sender) {
    return { text: '🚫 No puedes banearte a ti mismo.' }
  }
  await ensureBansTable()
  try {
    const userKey = onlyDigits(targetJid)
    await db('group_bans').insert({ group_id: remoteJid, user_jid: userKey || targetJid }).onConflict(['group_id', 'user_jid']).ignore()
    return { text: `✅ Usuario @${targetJid.split('@')[0]} ha sido baneado del uso del bot en este grupo.`, mentions: [targetJid] }
  } catch (e) {
    return { text: '⚠️ Ocurrió un error al banear al usuario.' }
  }
}

async function unban(ctx) {
  const { isGroup, isOwner, remoteJid, sock, sender } = ctx
  if (!isGroup) {
    return { text: '❌ Este comando solo funciona en grupos.' }
  }
  let isAdmin = !!ctx.isAdmin
  if (!isAdmin && sock && remoteJid && sender) {
    try {
      const roles = await getGroupRoles(sock, remoteJid, sender)
      isAdmin = roles.isAdmin
    } catch (e) {}
  }
  if (!isAdmin && !isOwner) {
    return { text: '🚫 Solo los administradores o el owner pueden desbanear usuarios del bot.' }
  }
  const targetJid = extractTargetJid(ctx)
  if (!targetJid) {
    return { text: '❌ Uso: /unban @usuario o responde a un mensaje con /unban.' }
  }
  await ensureBansTable()
  try {
    const userKey = onlyDigits(targetJid)
    const deleted = await db('group_bans').where({ group_id: remoteJid }).andWhere((q) => {
        if (userKey) q.where('user_jid', userKey).orWhere('user_jid', targetJid)
        else q.where('user_jid', targetJid)
    }).del()
    if (!deleted) {
      return { text: `❌ El usuario @${targetJid.split('@')[0]} no estaba baneado en este grupo.`, mentions: [targetJid] }
    }
    return { text: `✅ Usuario @${targetJid.split('@')[0]} ha sido desbaneado del uso del bot en este grupo.`, mentions: [targetJid] }
  } catch (e) {
    return { text: '⚠️ Ocurrió un error al desbanear al usuario.' }
  }
}

async function bans(ctx) {
    const { isGroup, isOwner, remoteJid, sock, sender } = ctx
    if (!isGroup) {
        return { text: '❌ Este comando solo funciona en grupos.' }
    }
    let isAdmin = !!ctx.isAdmin
    if (!isAdmin && sock && remoteJid && sender) {
        try {
            const roles = await getGroupRoles(sock, remoteJid, sender)
            isAdmin = roles.isAdmin
        } catch (e) {}
    }
    if (!isAdmin && !isOwner) {
        return { text: '🚫 Solo los administradores o el owner pueden ver la lista de baneados.' }
    }
    await ensureBansTable()
    try {
        const rows = await db('group_bans').where({ group_id: remoteJid }).orderBy('created_at', 'asc')
        if (!rows.length) {
            return { text: '✅ No hay usuarios baneados en este grupo.' }
        }
        const lines = rows.map((r, i) => {
            const num = (r.user_jid || '').split('@')[0] || 'desconocido'
            return `${i + 1}. @${num}`
        })
        const mentions = rows.map((r) => r.user_jid)
        const text = `📋 *Usuarios baneados del bot en este grupo*\n\n${lines.join('\n')}`
        return { text, mentions }
    } catch (e) {
        return { text: '⚠️ Ocurrió un error al obtener la lista de baneados.' }
    }
}

export default [
    {
        name: 'ban',
        description: 'Banea a un usuario del uso del bot en el grupo.',
        category: 'admin',
        handler: ban
    },
    {
        name: 'unban',
        description: 'Desbanea a un usuario del uso del bot en el grupo.',
        category: 'admin',
        handler: unban
    },
    {
        name: 'bans',
        description: 'Muestra la lista de usuarios baneados en el grupo.',
        category: 'admin',
        handler: bans
    }
];

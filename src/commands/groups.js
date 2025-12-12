// commands/groups.js
// Administración de grupos

import db from '../database/db.js'
import { getGroupRoles, getGroupMetadataCached } from '../utils/utils/group-helper.js'

const onlyDigits = (v) => String(v || '').replace(/\D/g, '')
const first = (v) => (Array.isArray(v) && v.length ? v[0] : null)

async function ensureGroupsTable() {
  const exists = await db.schema.hasTable('grupos_autorizados')
  if (!exists) {
    await db.schema.createTable('grupos_autorizados', (t) => {
      t.increments('id')
      t.string('jid').unique().notNullable()
      t.boolean('bot_enabled').defaultTo(true)
      t.string('tipo').nullable()
      t.timestamp('updated_at').defaultTo(db.fn.now())
    })
  }
}

export async function kick(ctx) {
  const { isGroup, remoteJid, args, sock, message, sender } = ctx
  if (!isGroup) return { success: false, message: 'ℹ️ Este comando solo funciona en grupos.' }

  try {
    const { isAdmin, isBotAdmin } = await getGroupRoles(sock, remoteJid, sender)
    if (!isAdmin) return { success: false, message: '⛔ No tienes permisos de administrador para hacer esto.' }
    if (!isBotAdmin) return { success: false, message: '⛔ El bot necesita ser administrador para poder expulsar miembros.' }

    let targetJid =
      first(message?.message?.extendedTextMessage?.contextInfo?.mentionedJid) ||
      message?.message?.extendedTextMessage?.contextInfo?.participant

    if (!targetJid && Array.isArray(args) && args.length > 0) {
      const digits = onlyDigits(args[0])
      if (digits) targetJid = `${digits}@s.whatsapp.net`
    }

    if (!targetJid) {
      return { success: false, message: 'ℹ️ Uso: /kick @usuario o responde al mensaje de alguien con /kick.' }
    }

    await sock.groupParticipantsUpdate(remoteJid, [targetJid], 'remove')
    return {
      success: true,
      message: `👢 Usuario @${targetJid.split('@')[0]} ha sido expulsado por @${(sender || '').split('@')[0]}.`,
      mentions: [targetJid, sender],
    }
  } catch (error) {
    console.error('Error en /kick:', error)
    return { success: false, message: '⚠️ Ocurrió un error al intentar expulsar al usuario.' }
  }
}

export async function promote(ctx) {
  const { isGroup, remoteJid, args, sock, message, sender } = ctx
  if (!isGroup) return { success: false, message: 'ℹ️ Comando solo para grupos.' }

  try {
    const { isAdmin, isBotAdmin } = await getGroupRoles(sock, remoteJid, sender)
    if (!isAdmin) return { success: false, message: '⛔ No eres administrador.' }
    if (!isBotAdmin) return { success: false, message: '⛔ El bot no es administrador.' }

    const targetJid =
      first(message?.message?.extendedTextMessage?.contextInfo?.mentionedJid) ||
      message?.message?.extendedTextMessage?.contextInfo?.participant ||
      (Array.isArray(args) && args.length > 0 ? `${onlyDigits(args[0])}@s.whatsapp.net` : null)

    if (!targetJid) {
      return { success: false, message: 'ℹ️ Menciona a un usuario o responde a su mensaje para promoverlo.' }
    }

    await sock.groupParticipantsUpdate(remoteJid, [targetJid], 'promote')
    return {
      success: true,
      message: `🆙 @${targetJid.split('@')[0]} ha sido promovido a administrador.`,
      mentions: [targetJid],
    }
  } catch (e) {
    console.error('Error en /promote:', e)
    return { success: false, message: '⚠️ Error al promover al usuario.' }
  }
}

export async function demote(ctx) {
  const { isGroup, remoteJid, args, sock, message, sender } = ctx
  if (!isGroup) return { success: false, message: 'ℹ️ Comando solo para grupos.' }

  try {
    const { isAdmin, isBotAdmin } = await getGroupRoles(sock, remoteJid, sender)
    if (!isAdmin) return { success: false, message: '⛔ No eres administrador.' }
    if (!isBotAdmin) return { success: false, message: '⛔ El bot no es administrador.' }

    const targetJid =
      first(message?.message?.extendedTextMessage?.contextInfo?.mentionedJid) ||
      message?.message?.extendedTextMessage?.contextInfo?.participant ||
      (Array.isArray(args) && args.length > 0 ? `${onlyDigits(args[0])}@s.whatsapp.net` : null)

    if (!targetJid) {
      return { success: false, message: 'ℹ️ Menciona a un usuario o responde a su mensaje para degradarlo.' }
    }

    await sock.groupParticipantsUpdate(remoteJid, [targetJid], 'demote')
    return {
      success: true,
      message: `🔽 @${targetJid.split('@')[0]} ya no es administrador.`,
      mentions: [targetJid],
    }
  } catch (e) {
    console.error('Error en /demote:', e)
    return { success: false, message: '⚠️ Error al degradar al usuario.' }
  }
}

export async function lock(ctx) {
  const { isGroup, remoteJid, sock, sender } = ctx
  if (!isGroup) return { success: false, message: 'ℹ️ Este comando solo funciona en grupos.' }

  try {
    const { isAdmin, isBotAdmin } = await getGroupRoles(sock, remoteJid, sender)
    if (!isAdmin) return { success: false, message: '⛔ No tienes permisos de administrador.' }
    if (!isBotAdmin) return { success: false, message: '⛔ El bot necesita ser administrador.' }

    await sock.groupSettingUpdate(remoteJid, 'announcement')
    return { success: true, message: '🔒 Grupo bloqueado. Solo administradores pueden enviar mensajes.' }
  } catch (error) {
    console.error('Error en /lock:', error)
    return { success: false, message: '⚠️ Error al bloquear el grupo.' }
  }
}

export async function unlock(ctx) {
  const { isGroup, remoteJid, sock, sender } = ctx
  if (!isGroup) return { success: false, message: 'ℹ️ Este comando solo funciona en grupos.' }

  try {
    const { isAdmin, isBotAdmin } = await getGroupRoles(sock, remoteJid, sender)
    if (!isAdmin) return { success: false, message: '⛔ No tienes permisos de administrador.' }
    if (!isBotAdmin) return { success: false, message: '⛔ El bot necesita ser administrador.' }

    await sock.groupSettingUpdate(remoteJid, 'not_announcement')
    return { success: true, message: '🔓 Grupo desbloqueado. Todos los miembros pueden enviar mensajes.' }
  } catch (error) {
    console.error('Error en /unlock:', error)
    return { success: false, message: '⚠️ Error al desbloquear el grupo.' }
  }
}

export async function tag(ctx) {
  const { message, remoteJid, sock, args, sender } = ctx

  try {
    const { isAdmin } = await getGroupRoles(sock, remoteJid, sender)
    if (!isAdmin) return { success: false, message: '⛔ Solo los administradores pueden usar /tag.' }

    const metadata = await getGroupMetadataCached(sock, remoteJid)
    const participants = metadata?.participants || []
    if (participants.length === 0) return { success: false, message: '⚠️ No se pudo obtener la lista de miembros.' }

    const mentions = participants.map((p) => p.id)
    const text = (Array.isArray(args) && args.join(' ').trim()) || '📢 ¡Atención a todos!'

    return { success: true, message: text, mentions }
  } catch (e) {
    console.error('Error en /tag:', e)
    return { success: false, message: '⚠️ Error al enviar tag.' }
  }
}

export async function admins(ctx) {
  const { remoteJid, sock } = ctx

  try {
    const metadata = await getGroupMetadataCached(sock, remoteJid)
    const admins = (metadata?.participants || []).filter(
      (p) => p.admin === 'admin' || p.admin === 'superadmin' || p.admin === 'owner'
    )

    if (admins.length === 0) return { success: true, message: 'ℹ️ No hay administradores en este grupo.' }

    const list = admins.map((a, i) => `${i + 1}. @${a.id.split('@')[0]}`).join('\n')
    const mentions = admins.map((a) => a.id)
    const text = `👑 *Administradores del Grupo*\n\n${list}`

    return { success: true, message: text, mentions }
  } catch (e) {
    console.error('Error en /admins:', e)
    return { success: false, message: '⚠️ Error al obtener administradores.' }
  }
}

export async function addGroup(ctx) {
  const { isGroup, remoteJid, sock, sender } = ctx
  if (!isGroup) return { success: false, message: 'ℹ️ Este comando solo funciona en grupos.' }

  try {
    const { isAdmin } = await getGroupRoles(sock, remoteJid, sender)
    if (!isAdmin) return { success: false, message: '⛔ Solo los administradores pueden usar este comando.' }

    await ensureGroupsTable()
    const existing = await db('grupos_autorizados').where({ jid: remoteJid }).first()
    if (existing) {
      await db('grupos_autorizados').where({ jid: remoteJid }).update({ bot_enabled: true })
    } else {
      await db('grupos_autorizados').insert({ jid: remoteJid, bot_enabled: true, tipo: 'general' })
    }
    return { success: true, message: '✅ Bot habilitado en este grupo.' }
  } catch (e) {
    console.error('Error en /addgroup:', e)
    return { success: false, message: '⚠️ Error al habilitar el bot.' }
  }
}

export async function delGroup(ctx) {
  const { isGroup, remoteJid, sock, sender } = ctx
  if (!isGroup) return { success: false, message: 'ℹ️ Este comando solo funciona en grupos.' }

  try {
    const { isAdmin } = await getGroupRoles(sock, remoteJid, sender)
    if (!isAdmin) return { success: false, message: '⛔ Solo los administradores pueden usar este comando.' }

    await ensureGroupsTable()
    await db('grupos_autorizados').where({ jid: remoteJid }).update({ bot_enabled: false })
    return { success: true, message: '🚫 Bot deshabilitado en este grupo.' }
  } catch (e) {
    console.error('Error en /delgroup:', e)
    return { success: false, message: '⚠️ Error al desactivar el bot.' }
  }
}

export default { addGroup, delGroup, kick, promote, demote, lock, unlock, tag, admins }

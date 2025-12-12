// commands/groups.js
// Administración de grupos - VERSIÓN CORREGIDA

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

// ✅ HELPER: Verificar si el usuario es admin (usa ctx.isAdmin primero)
function isUserAdmin(ctx) {
  // Primero intentar usar el isAdmin del contexto (ya calculado en whatsapp.js)
  if (ctx.isAdmin === true) return true

  // Si es owner, automáticamente es admin
  if (ctx.isOwner === true) return true

  // Si no está definido o es false, retornar false
  return false
}

// ✅ HELPER: Verificar si el bot es admin
function isBotGroupAdmin(ctx) {
  // Usar el isBotAdmin del contexto
  return ctx.isBotAdmin === true
}

export async function kick(ctx) {
  const { isGroup, remoteJid, args, sock, message, sender, fromMe } = ctx
  if (!isGroup) return { success: false, message: 'ℹ️ Este comando solo funciona en grupos.' }

  try {
    // ✅ Verificar permisos usando helpers
    if (!fromMe && !isUserAdmin(ctx)) {
      return { success: false, message: '⛔ No tienes permisos de administrador para hacer esto.' }
    }

    if (!isBotGroupAdmin(ctx)) {
      return { success: false, message: '⛔ El bot necesita ser administrador para poder expulsar miembros.' }
    }

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
    // ✅ Verificar permisos
    if (!isUserAdmin(ctx)) {
      return { success: false, message: '⛔ No eres administrador.' }
    }

    if (!isBotGroupAdmin(ctx)) {
      return { success: false, message: '⛔ El bot no es administrador.' }
    }

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
    // ✅ Verificar permisos
    if (!isUserAdmin(ctx)) {
      return { success: false, message: '⛔ No eres administrador.' }
    }

    if (!isBotGroupAdmin(ctx)) {
      return { success: false, message: '⛔ El bot no es administrador.' }
    }

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
    // ✅ Verificar permisos
    if (!isUserAdmin(ctx)) {
      return { success: false, message: '⛔ No tienes permisos de administrador.' }
    }

    if (!isBotGroupAdmin(ctx)) {
      return { success: false, message: '⛔ El bot necesita ser administrador.' }
    }

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
    // ✅ CORRECCIÓN: Verificar permisos usando helpers
    console.log('[unlock] DEBUG - ctx.isAdmin:', ctx.isAdmin)
    console.log('[unlock] DEBUG - ctx.isOwner:', ctx.isOwner)
    console.log('[unlock] DEBUG - ctx.isBotAdmin:', ctx.isBotAdmin)

    if (!isUserAdmin(ctx)) {
      return { success: false, message: '⛔ No tienes permisos de administrador.' }
    }

    if (!isBotGroupAdmin(ctx)) {
      return { success: false, message: '⛔ El bot necesita ser administrador.' }
    }

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
    // ✅ Verificar permisos
    if (!isUserAdmin(ctx)) {
      return { success: false, message: '⛔ Solo los administradores pueden usar /tag.' }
    }

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
    // ✅ Verificar permisos
    if (!isUserAdmin(ctx)) {
      return { success: false, message: '⛔ Solo los administradores pueden usar este comando.' }
    }

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
    // ✅ Verificar permisos
    if (!isUserAdmin(ctx)) {
      return { success: false, message: '⛔ Solo los administradores pueden usar este comando.' }
    }

    await ensureGroupsTable()
    await db('grupos_autorizados').where({ jid: remoteJid }).update({ bot_enabled: false })
    return { success: true, message: '🚫 Bot deshabilitado en este grupo.' }
  } catch (e) {
    console.error('Error en /delgroup:', e)
    return { success: false, message: '⚠️ Error al desactivar el bot.' }
  }
}

// ✅ NUEVO: Comando de debug para verificar permisos
export async function whoami(ctx) {
  const { sender, isOwner, isAdmin, isBotAdmin, isGroup } = ctx

  const lines = [
    '👤 *Tu información*',
    '',
    `📱 Número: ${sender}`,
    `👑 Owner: ${isOwner ? 'Sí' : 'No'}`,
  ]

  if (isGroup) {
    lines.push(`🛡️ Admin del grupo: ${isAdmin ? 'Sí' : 'No'}`)
    lines.push(`🤖 Bot es admin: ${isBotAdmin ? 'Sí' : 'No'}`)
  }

  return { success: true, message: lines.join('\n') }
}

// ✅ NUEVO: Debug de grupo completo
export async function debuggroup(ctx) {
  const { sock, remoteJid, sender, isOwner, isAdmin, isBotAdmin } = ctx

  if (!isOwner && !isAdmin) {
    return { success: false, message: '⛔ Solo admins u owner pueden usar este comando.' }
  }

  try {
    const metadata = await getGroupMetadataCached(sock, remoteJid)
    const participants = metadata?.participants || []
    const admins = participants.filter(p => p.admin === 'admin' || p.admin === 'superadmin')

    const lines = [
      '🔍 *Debug del Grupo*',
      '',
      `📛 Nombre: ${metadata?.subject || 'Sin nombre'}`,
      `🆔 ID: ${remoteJid}`,
      `👥 Miembros: ${participants.length}`,
      `👑 Admins: ${admins.length}`,
      '',
      '*Tu estatus:*',
      `🛡️ Admin: ${isAdmin ? 'Sí ✅' : 'No ❌'}`,
      `👑 Owner: ${isOwner ? 'Sí ✅' : 'No ❌'}`,
      '',
      '*Bot:*',
      `🤖 Admin: ${isBotAdmin ? 'Sí ✅' : 'No ❌'}`,
    ]

    return { success: true, message: lines.join('\n') }
  } catch (e) {
    return { success: false, message: `⚠️ Error: ${e.message}` }
  }
}

// ✅ NUEVO: Debug de permisos de admin
export async function debugadmin(ctx) {
  const { sock, remoteJid, sender, isGroup } = ctx

  if (!isGroup) {
    return { success: false, message: 'ℹ️ Este comando solo funciona en grupos.' }
  }

  try {
    // Obtener roles usando el helper
    const roles = await getGroupRoles(sock, remoteJid, sender)

    const lines = [
      '🔍 *Debug de Admin*',
      '',
      `📱 Tu JID: ${sender}`,
      `🛡️ isAdmin (helper): ${roles.isAdmin ? 'Sí' : 'No'}`,
      `🤖 isBotAdmin (helper): ${roles.isBotAdmin ? 'Sí' : 'No'}`,
      '',
      '*Contexto:*',
      `🛡️ ctx.isAdmin: ${ctx.isAdmin ? 'Sí' : 'No'}`,
      `🤖 ctx.isBotAdmin: ${ctx.isBotAdmin ? 'Sí' : 'No'}`,
      `👑 ctx.isOwner: ${ctx.isOwner ? 'Sí' : 'No'}`,
    ]

    return { success: true, message: lines.join('\n') }
  } catch (e) {
    return { success: false, message: `⚠️ Error: ${e.message}` }
  }
}

// ✅ Comando para verificar si el bot REALMENTE puede ejecutar acciones
export async function testBotAdmin(ctx) {
  const { sock, remoteJid, isGroup } = ctx

  if (!isGroup) {
    return { success: false, message: 'ℹ️ Este comando solo funciona en grupos.' }
  }

  try {
    // Intentar obtener metadata (requiere permisos básicos)
    const metadata = await sock.groupMetadata(remoteJid)

    // Buscar el bot en participantes
    const botNumber = normalizePhoneNumber(sock?.user?.id)
    const botParticipant = (metadata?.participants || []).find(p =>
      normalizePhoneNumber(p.id) === botNumber
    )

    const isAdmin = botParticipant?.admin === 'admin' ||
                    botParticipant?.admin === 'superadmin'

    const lines = [
      '🧪 *Test de Permisos del Bot*',
      '',
      '✅ Metadata obtenida correctamente',
      `📊 Bot encontrado: ${botParticipant ? 'Sí' : 'No'}`,
      `🛡️ Rol: ${botParticipant?.admin || 'member'}`,
      `🤖 Es admin: ${isAdmin ? 'Sí ✅' : 'No ❌'}`,
      '',
      '*Acciones disponibles:*',
      `${isAdmin ? '✅' : '❌'} Expulsar miembros`,
      `${isAdmin ? '✅' : '❌'} Promover/degradar admins`,
      `${isAdmin ? '✅' : '❌'} Cambiar configuración del grupo`,
      `${isAdmin ? '✅' : '❌'} Cambiar nombre/descripción`,
      '',
      isAdmin
        ? '✨ El bot tiene todos los permisos necesarios'
        : '⚠️ Hazme admin para usar comandos administrativos'
    ]

    return { success: true, message: lines.join('\n') }
  } catch (e) {
    return {
      success: false,
      message: `⚠️ Error verificando permisos: ${e.message}`
    }
  }
}

function normalizePhoneNumber(jidOrNumber) {
  if (!jidOrNumber) return null
  let str = String(jidOrNumber)
  const atIndex = str.indexOf('@')
  if (atIndex > 0) str = str.slice(0, atIndex)
  const colonIndex = str.indexOf(':')
  if (colonIndex > 0) str = str.slice(0, colonIndex)
  return str.replace(/\D/g, '') || null
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
  whoami,
  debuggroup,
  debugadmin,
  testBotAdmin
}

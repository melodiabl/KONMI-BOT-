// commands/ban.js
 // Sistema de ban por grupo con validaciones mejoradas

import db from '../database/db.js'
import { getGroupRoles } from '../utils/utils/group-helper.js'

const onlyDigits = (v) => String(v || '').replace(/\D/g, '')

/**
 * Valida si un JID tiene formato válido
 * @param {string} jid - JID a validar
 * @returns {boolean}
 */
function isValidJid(jid) {
  if (!jid || typeof jid !== 'string') return false
  const match = jid.match(/^(\d+)@s\.whatsapp\.net$/)
  return !!match && match[1].length >= 10
}

/**
 * Valida si un número de teléfono es válido
 * @param {string} digits - Solo dígitos
 * @returns {boolean}
 */
function isValidPhoneNumber(digits) {
  return digits && digits.length >= 10 && digits.length <= 15
}

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
      console.log('✅ Tabla group_bans creada exitosamente')
    }
    bansTableInitialized = true
  } catch (e) {
    console.error('❌ Error al crear tabla group_bans:', e.message)
    throw e
  }
}

/**
 * Extrae el JID del usuario objetivo desde el contexto
 * @param {object} ctx - Contexto del comando
 * @returns {string|null} JID válido o null
 */
function extractTargetJid(ctx) {
  const { message, args } = ctx
  const quoted = message?.message?.extendedTextMessage?.contextInfo

  // Intenta obtener desde menciones en mensaje citado
  if (quoted?.mentionedJid?.length > 0) {
    const jid = quoted.mentionedJid[0]
    if (isValidJid(jid)) return jid
  }

  // Intenta obtener desde participante del mensaje citado
  if (quoted?.participant) {
    if (isValidJid(quoted.participant)) return quoted.participant
  }

  // Intenta obtener desde argumentos
  if (Array.isArray(args) && args.length > 0) {
    const mention = String(args[0] || '').replace('@', '').trim()
    const digits = onlyDigits(mention)

    if (isValidPhoneNumber(digits)) {
      return `${digits}@s.whatsapp.net`
    }
  }

  return null
}

/**
 * Verifica si el usuario tiene permisos de administrador
 * @param {object} ctx - Contexto del comando
 * @returns {Promise<boolean>}
 */
async function checkAdminPermission(ctx) {
  const { isOwner, isAdmin, sock, remoteJid, sender } = ctx

  if (isOwner) return true
  if (isAdmin) return true

  // Verifica roles en el grupo si es necesario
  if (sock && remoteJid && sender) {
    try {
      const roles = await getGroupRoles(sock, remoteJid, sender)
      return roles.isAdmin || roles.isSuperAdmin
    } catch (e) {
      console.error('⚠️ Error al verificar roles del grupo:', e.message)
      return false
    }
  }

  return false
}

/**
 * Banea a un usuario del bot en el grupo
 * @param {object} ctx - Contexto del comando
 * @returns {Promise<object>}
 */
export async function ban(ctx) {
  const { isGroup, remoteJid, sender, sock } = ctx

  if (!isGroup) {
    return {
      success: false,
      message: '❌ Este comando solo funciona en grupos.',
    }
  }

  try {
    const hasPermission = await checkAdminPermission(ctx)
    if (!hasPermission) {
      return {
        success: false,
        message: '🚫 Solo los administradores o el owner pueden banear usuarios del bot.',
      }
    }

    const targetJid = extractTargetJid(ctx)
    if (!targetJid) {
      return {
        success: false,
        message: '❌ Uso: /ban @usuario o responde a un mensaje con /ban.',
      }
    }

    if (targetJid === sender) {
      return {
        success: false,
        message: '🚫 No puedes banearte a ti mismo.',
      }
    }

    await ensureBansTable()

    const userKey = onlyDigits(targetJid)
    await db('group_bans')
      .insert({ group_id: remoteJid, user_jid: userKey || targetJid })
      .onConflict(['group_id', 'user_jid'])
      .ignore()

    const userName = targetJid.split('@')[0]
    return {
      success: true,
      message: `✅ Usuario @${userName} ha sido baneado del uso del bot en este grupo.`,
      mentions: [targetJid],
    }
  } catch (e) {
    console.error('❌ Error en /ban:', e.message)
    return {
      success: false,
      message: '⚠️ Ocurrió un error al banear al usuario. Intenta de nuevo.',
    }
  }
}

/**
 * Desbanea a un usuario del bot en el grupo
 * @param {object} ctx - Contexto del comando
 * @returns {Promise<object>}
 */
export async function unban(ctx) {
  const { isGroup, remoteJid, sender, sock } = ctx

  if (!isGroup) {
    return {
      success: false,
      message: '❌ Este comando solo funciona en grupos.',
    }
  }

  try {
    const hasPermission = await checkAdminPermission(ctx)
    if (!hasPermission) {
      return {
        success: false,
        message: '🚫 Solo los administradores o el owner pueden desbanear usuarios del bot.',
      }
    }

    const targetJid = extractTargetJid(ctx)
    if (!targetJid) {
      return {
        success: false,
        message: '❌ Uso: /unban @usuario o responde a un mensaje con /unban.',
      }
    }

    await ensureBansTable()

    const userKey = onlyDigits(targetJid)
    const deleted = await db('group_bans')
      .where({ group_id: remoteJid })
      .andWhere((q) => {
        if (userKey) {
          q.where('user_jid', userKey).orWhere('user_jid', targetJid)
        } else {
          q.where('user_jid', targetJid)
        }
      })
      .del()

    if (!deleted) {
      const userName = targetJid.split('@')[0]
      return {
        success: false,
        message: `❌ El usuario @${userName} no estaba baneado en este grupo.`,
        mentions: [targetJid],
      }
    }

    const userName = targetJid.split('@')[0]
    return {
      success: true,
      message: `✅ Usuario @${userName} ha sido desbaneado del uso del bot en este grupo.`,
      mentions: [targetJid],
    }
  } catch (e) {
    console.error('❌ Error en /unban:', e.message)
    return {
      success: false,
      message: '⚠️ Ocurrió un error al desbanear al usuario. Intenta de nuevo.',
    }
  }
}

/**
 * Lista todos los usuarios baneados en el grupo
 * @param {object} ctx - Contexto del comando
 * @returns {Promise<object>}
 */
export async function bans(ctx) {
  const { isGroup, remoteJid, sender, sock } = ctx

  if (!isGroup) {
    return {
      success: false,
      message: '❌ Este comando solo funciona en grupos.',
    }
  }

  try {
    const hasPermission = await checkAdminPermission(ctx)
    if (!hasPermission) {
      return {
        success: false,
        message: '🚫 Solo los administradores o el owner pueden ver la lista de baneados.',
      }
    }

    await ensureBansTable()

    const rows = await db('group_bans')
      .where({ group_id: remoteJid })
      .orderBy('created_at', 'asc')

    if (!rows || rows.length === 0) {
      return {
        success: true,
        message: '✅ No hay usuarios baneados en este grupo.',
      }
    }

    const lines = rows.map((r, i) => {
      const num = (r.user_jid || '').split('@')[0] || 'desconocido'
      return `${i + 1}. @${num}`
    })

    const mentions = rows
      .map((r) => r.user_jid)
      .filter((jid) => isValidJid(jid) || /^\d+$/.test(jid))

    const text = `📋 *Usuarios baneados del bot en este grupo*\n\n${lines.join('\n')}`

    return {
      success: true,
      message: text,
      mentions: mentions.length > 0 ? mentions : undefined,
    }
  } catch (e) {
    console.error('❌ Error en /bans:', e.message)
    return {
      success: false,
      message: '⚠️ Ocurrió un error al obtener la lista de baneados. Intenta de nuevo.',
    }
  }
}

export default { ban, unban, bans }

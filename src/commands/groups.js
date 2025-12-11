// commands/groups.js
// Refactorizado para usar Buttons Messages nativos y lógica de permisos mejorada
import db from '../database/db.js'

// --- FUNCIONES DE UTILIDAD ---
const onlyDigits = (v) => String(v || '').replace(/[^0-9]/g, '')
const normalizeDigits = (userOrJid) => {
  try {
    let s = String(userOrJid || '')
    const at = s.indexOf('@'); if (at > 0) s = s.slice(0, at)
    const col = s.indexOf(':'); if (col > 0) s = s.slice(0, col)
    return s.replace(/\D/g, '')
  } catch { return onlyDigits(userOrJid) }
}
const first = (v) => (Array.isArray(v) && v.length ? v[0] : null)
// --- FIN FUNCIONES DE UTILIDAD ---

async function fetchGroupMetadata(ctx) {
  const { sock, remoteJid } = ctx
  if (!sock || !remoteJid) return null
  try {
    return await sock.groupMetadata(remoteJid)
  } catch (e) {
    console.error('Error obteniendo metadata de grupo en comando:', e?.message || e)
    return null
  }
}

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

// Comandos de administración de grupos refactorizados

export async function kick(ctx) {
  const { isGroup, isAdmin, isBotAdmin, remoteJid, args, sock, message, sender } = ctx
  if (!isGroup) return { success: false, message: 'ℹ️ Este comando solo funciona en grupos.' }
  if (!isAdmin) return { success: false, message: '⛔ No tienes permisos de administrador para hacer esto.' }
  if (!isBotAdmin) return { success: false, message: '⛔ El bot necesita ser administrador para poder expulsar miembros.' }

  let targetJid = first(message?.message?.extendedTextMessage?.contextInfo?.mentionedJid) ||
                  message?.message?.extendedTextMessage?.contextInfo?.participant

  if (!targetJid && args.length > 0) {
    const digits = onlyDigits(args[0])
    if (digits) targetJid = `${digits}@s.whatsapp.net`
  }

  if (!targetJid) {
    return { success: false, message: 'ℹ️ Uso: /kick @usuario o responde al mensaje de alguien con /kick.' }
  }

  try {
    await sock.groupParticipantsUpdate(remoteJid, [targetJid], 'remove')
    return {
      success: true,
      message: `👢 Usuario @${targetJid.split('@')[0]} ha sido expulsado por @${sender.split('@')[0]}.`,
      mentions: [targetJid, sender],
    }
  } catch (error) {
    console.error('Error en /kick:', error)
    return { success: false, message: '⚠️ Ocurrió un error al intentar expulsar al usuario.' }
  }
}

export async function promote(ctx) {
    const { isGroup, isAdmin, isBotAdmin, remoteJid, args, sock, message } = ctx
    if (!isGroup) return { success: false, message: 'ℹ️ Comando solo para grupos.' };
    if (!isAdmin) return { success: false, message: '⛔ No eres administrador.' };
    if (!isBotAdmin) return { success: false, message: '⛔ El bot no es administrador.' };

    const targetJid = first(message?.message?.extendedTextMessage?.contextInfo?.mentionedJid) ||
                      message?.message?.extendedTextMessage?.contextInfo?.participant ||
                      (args.length > 0 ? `${onlyDigits(args[0])}@s.whatsapp.net` : null);

    if (!targetJid) {
        return { success: false, message: 'ℹ️ Menciona a un usuario o responde a su mensaje para promoverlo.' };
    }

    try {
        await sock.groupParticipantsUpdate(remoteJid, [targetJid], 'promote');
        return {
            success: true,
            message: `👑 @${targetJid.split('@')[0]} ha sido promovido a administrador.`,
            mentions: [targetJid],
        };
    } catch (e) {
        return { success: false, message: '⚠️ Error al promover al usuario.' };
    }
}

export async function demote(ctx) {
    const { isGroup, isAdmin, isBotAdmin, remoteJid, args, sock, message } = ctx
    if (!isGroup) return { success: false, message: 'ℹ️ Comando solo para grupos.' };
    if (!isAdmin) return { success: false, message: '⛔ No eres administrador.' };
    if (!isBotAdmin) return { success: false, message: '⛔ El bot no es administrador.' };

    const targetJid = first(message?.message?.extendedTextMessage?.contextInfo?.mentionedJid) ||
                      message?.message?.extendedTextMessage?.contextInfo?.participant ||
                      (args.length > 0 ? `${onlyDigits(args[0])}@s.whatsapp.net` : null);

    if (!targetJid) {
        return { success: false, message: 'ℹ️ Menciona a un usuario o responde a su mensaje para degradarlo.' };
    }

    try {
        await sock.groupParticipantsUpdate(remoteJid, [targetJid], 'demote');
        return {
            success: true,
            message: `🚶 @${targetJid.split('@')[0]} ya no es administrador.`,
            mentions: [targetJid],
        };
    } catch (e) {
        return { success: false, message: '⚠️ Error al degradar al usuario.' };
    }
}


export async function lock(ctx) {
  const { isGroup, isAdmin, isBotAdmin, remoteJid, sock } = ctx
  if (!isGroup) return { success: false, message: 'ℹ️ Este comando solo funciona en grupos.' }
  if (!isAdmin) return { success: false, message: '⛔ No tienes permisos de administrador.' }
  if (!isBotAdmin) return { success: false, message: '⛔ El bot necesita ser administrador.' }

  try {
    await sock.groupSettingUpdate(remoteJid, 'announcement')
    return { success: true, message: '🔒 Grupo bloqueado. Ahora solo los administradores pueden enviar mensajes.' }
  } catch (error) {
    return { success: false, message: '⚠️ Error al bloquear el grupo.' }
  }
}

export async function unlock(ctx) {
  const { isGroup, isAdmin, isBotAdmin, remoteJid, sock } = ctx
  if (!isGroup) return { success: false, message: 'ℹ️ Este comando solo funciona en grupos.' }
  if (!isAdmin) return { success: false, message: '⛔ No tienes permisos de administrador.' }
  if (!isBotAdmin) return { success: false, message: '⛔ El bot necesita ser administrador.' }

  try {
    await sock.groupSettingUpdate(remoteJid, 'not_announcement')
    return { success: true, message: '🔓 Grupo desbloqueado. Todos los miembros pueden enviar mensajes.' }
  } catch (error) {
    return { success: false, message: '⚠️ Error al desbloquear el grupo.' }
  }
}

export async function tag(ctx) {
    const { message, remoteJid, sock, args, groupMetadata, isAdmin } = ctx
    if (!isAdmin) return { success: false, message: '⛔ Solo los administradores pueden usar /tag.' };

    const participants = groupMetadata?.participants || [];
    if (participants.length === 0) return { success: false, message: 'No se pudo obtener la lista de miembros.' };

    const mentions = participants.map(p => p.id);
    const text = args.join(' ') || '¡Atención a todos!';

    return { success: true, message: text, mentions };
}

export async function admins(ctx) {
    const { remoteJid, groupMetadata } = ctx
    const admins = (groupMetadata?.participants || []).filter(p => p.admin === 'admin' || p.admin === 'superadmin');
    if (admins.length === 0) return { success: true, message: 'ℹ️ No hay administradores en este grupo.' };

    const list = admins.map((a, i) => `${i + 1}. @${a.id.split('@')[0]}`).join('\n');
    const mentions = admins.map(a => a.id);
    const text = `👑 *Administradores del Grupo*\n\n${list}`;

    return { success: true, message: text, mentions };
}


export async function addGroup(ctx) {
  const { isGroup, isAdmin, remoteJid } = ctx
  if (!isGroup) return { success: false, message: 'ℹ️ Este comando solo funciona en grupos.' };
  if (!isAdmin) return { success: false, message: '⛔ Solo los administradores pueden usar este comando.' };

  await ensureGroupsTable();
  const existing = await db('grupos_autorizados').where({ jid: remoteJid }).first();
  if (existing) {
    await db('grupos_autorizados').where({ jid: remoteJid }).update({ bot_enabled: true });
  } else {
    await db('grupos_autorizados').insert({ jid: remoteJid, bot_enabled: true, tipo: 'general' });
  }
  return { success: true, message: '✅ Bot habilitado en este grupo.' };
}

export async function delGroup(ctx) {
  const { isGroup, isAdmin, remoteJid } = ctx
  if (!isGroup) return { success: false, message: 'ℹ️ Este comando solo funciona en grupos.' };
  if (!isAdmin) return { success: false, message: '⛔ Solo los administradores pueden usar este comando.' };

  await ensureGroupsTable();
  await db('grupos_autorizados').where({ jid: remoteJid }).update({ bot_enabled: false });
  return { success: true, message: '🛑 Bot deshabilitado en este grupo.' };
}

export default { addGroup, delGroup, kick, promote, demote, lock, unlock, tag, admins };

// ===== Aliases faltantes esperados por el registry y router.fixed =====
export async function whoami(ctx) {
  try {
    const { sender, isGroup, isAdmin, isBotAdmin, botNumber } = ctx
    const num = (sender || '').split('@')[0]
    const lines = [
      `🧑 Tu número: +${num}`,
      `📍 Contexto: ${isGroup ? 'Grupo' : 'Privado'}`,
      `🛡️ Admin: ${isAdmin ? 'sí' : 'no'}`,
      `🤖 Bot admin: ${isBotAdmin ? 'sí' : 'no'}`,
      `🤖 Bot: +${botNumber || 'desconocido'}`,
    ]
    return { success: true, message: lines.join('\n') }
  } catch { return { success: true, message: 'ℹ️ whoami' } }
}

export async function debugadmin(ctx) {
  const { isGroup, isAdmin, isBotAdmin, groupMetadata } = ctx
  const admins = (groupMetadata?.participants || []).filter(p => p.admin === 'admin' || p.admin === 'superadmin')
  const list = admins.map(a => '@' + a.id.split('@')[0]).join(', ')
  const lines = [
    '🧪 Debug Admin',
    `isGroup: ${!!isGroup}`,
    `isAdmin: ${!!isAdmin}`,
    `isBotAdmin: ${!!isBotAdmin}`,
    `admins: ${list || '(ninguno)'}`,
  ]
  return { success: true, message: lines.join('\n'), mentions: admins.map(a => a.id) }
}

export async function debuggroup(ctx) {
  const meta = ctx.groupMetadata || {}
  const lines = [
    '🧪 Debug Grupo',
    `id: ${meta.id || '-'}`,
    `subject: ${meta.subject || '-'}`,
    `participants: ${Array.isArray(meta.participants) ? meta.participants.length : 0}`,
  ]
  return { success: true, message: lines.join('\n') }
}

// Mantenerlos visibles en default export si algún consumer usa default
// (sin cambios) — default export ya definido arriba

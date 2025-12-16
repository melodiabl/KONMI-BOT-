// commands/groups.js
// Administración de grupos - VERSIÓN CORREGIDA

import db from './database/db.js'
import { getGroupRoles, getGroupMetadataCached } from '../plugins/utils/utils/group-helper.js'

const onlyDigits = (v) => String(v || '').replace(/\D/g, '')
const first = (v) => (Array.isArray(v) && v.length ? v[0] : null)

// Helper para mostrar @mención con nombre si existe en metadata
function resolveParticipantName(jid, metadata) {
  if (!jid) return null
  try {
    const parts = metadata?.participants || []
    const found = parts.find((p) => p?.id === jid)
    return found?.notify || found?.name || null
  } catch {
    return null
  }
}

function formatMentionWithName(jid, metadata) {
  const num = String(jid || '').split('@')[0]
  const name = resolveParticipantName(jid, metadata)
  return name ? `@${num} (${name})` : `@${num}`
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
  if (!isGroup) return { success: false, message: decorateBLGroupMessage('Error', 'Este comando solo funciona en grupos.\n🥺 Úsalo en un grupo', 'love') }

  try {
    // Funcionalidad Wileys: Reacción automática BL
    await addBLGroupReaction(sock, message, 'kick');

    // ?? Verificar permisos usando helpers
    if (!fromMe && !isUserAdmin(ctx)) {
      return { success: false, message: decorateBLGroupMessage('Sin Permisos', 'No tienes permisos de administrador\n🥺 Solo admins pueden expulsar', 'love') }
    }

    if (!isBotGroupAdmin(ctx)) {
      return { success: false, message: decorateBLGroupMessage('Bot Sin Permisos', 'El bot necesita ser administrador\n💔 Hazme admin para usar este comando', 'love') }
    }

    let targetJid =
      first(message?.message?.extendedTextMessage?.contextInfo?.mentionedJid) ||
      message?.message?.extendedTextMessage?.contextInfo?.participant

    if (!targetJid && Array.isArray(args) && args.length > 0) {
      const digits = onlyDigits(args[0])
      if (digits) targetJid = `${digits}@s.whatsapp.net`
    }

    if (!targetJid) {
      return { success: false, message: decorateBLGroupMessage('Uso de Kick', 'Uso: /kick @usuario\no responde al mensaje de alguien\ncon /kick', 'admin') }
    }

    const meta = await getGroupMetadataCached(sock, remoteJid)
    const targetLabel = formatMentionWithName(targetJid, meta)
    const actorLabel = formatMentionWithName(sender, meta)

    await sock.groupParticipantsUpdate(remoteJid, [targetJid], 'remove')

    const kickMessage = `Usuario ${targetLabel} ha sido expulsado\npor ${actorLabel} 💔\n\n🥺 Esperamos que puedas regresar`;

    return {
      success: true,
      message: decorateBLGroupMessage('Usuario Expulsado', kickMessage, 'admin'),
      mentions: [targetJid, sender],
    }
  } catch (error) {
    console.error('Error en /kick:', error)
    return { success: false, message: decorateBLGroupMessage('Error', 'Ocurrió un error al intentar\nexpulsar al usuario 😢', 'love') }
  }
}


export async function promote(ctx) {
  const { isGroup, remoteJid, args, sock, message, sender } = ctx
  if (!isGroup) return { success: false, message: decorateBLGroupMessage('Error', 'Comando solo para grupos.\n🥺 Úsalo en un grupo', 'love') }

  try {
    // Funcionalidad Wileys: Reacción automática BL
    await addBLGroupReaction(sock, message, 'promote');

    // ?? Verificar permisos
    if (!isUserAdmin(ctx)) {
      return { success: false, message: decorateBLGroupMessage('Sin Permisos', 'No eres administrador.\n🥺 Solo admins pueden promover', 'love') }
    }

    if (!isBotGroupAdmin(ctx)) {
      return { success: false, message: decorateBLGroupMessage('Bot Sin Permisos', 'El bot no es administrador.\n💔 Hazme admin para usar este comando', 'love') }
    }

    const targetJid =
      first(message?.message?.extendedTextMessage?.contextInfo?.mentionedJid) ||
      message?.message?.extendedTextMessage?.contextInfo?.participant ||
      (Array.isArray(args) && args.length > 0 ? `${onlyDigits(args[0])}@s.whatsapp.net` : null)

    if (!targetJid) {
      return { success: false, message: decorateBLGroupMessage('Uso de Promote', 'Menciona a un usuario o responde\na su mensaje para promoverlo.\n💡 Ejemplo: /promote @usuario', 'admin') }
    }

    const meta = await getGroupMetadataCached(sock, remoteJid)
    const targetLabel = formatMentionWithName(targetJid, meta)

    await sock.groupParticipantsUpdate(remoteJid, [targetJid], 'promote')

    const promoteMessage = `${targetLabel} ha sido promovido\na administrador 👑\n\n🎉 ¡Felicidades! Con mucho amor 💖`;

    return {
      success: true,
      message: decorateBLGroupMessage('Usuario Promovido', promoteMessage, 'admin'),
      mentions: [targetJid],
    }
  } catch (e) {
    console.error('Error en /promote:', e)
    return { success: false, message: decorateBLGroupMessage('Error', 'Error al promover al usuario.\n😢 Intenta de nuevo', 'love') }
  }
}


export async function demote(ctx) {
  const { isGroup, remoteJid, args, sock, message, sender } = ctx
  if (!isGroup) return { success: false, message: ' Comando solo para grupos.' }

  try {
    // ?? Verificar permisos
    if (!isUserAdmin(ctx)) {
      return { success: false, message: ' No eres administrador.' }
    }

    if (!isBotGroupAdmin(ctx)) {
      return { success: false, message: 'El bot no es administrador.' }
    }

    const targetJid =
      first(message?.message?.extendedTextMessage?.contextInfo?.mentionedJid) ||
      message?.message?.extendedTextMessage?.contextInfo?.participant ||
      (Array.isArray(args) && args.length > 0 ? `${onlyDigits(args[0])}@s.whatsapp.net` : null)

    if (!targetJid) {
      return { success: false, message: ' Menciona a un usuario o responde a su mensaje para degradarlo.' }
    }

    const meta = await getGroupMetadataCached(sock, remoteJid)
    const targetLabel = formatMentionWithName(targetJid, meta)

    await sock.groupParticipantsUpdate(remoteJid, [targetJid], 'demote')
    return {
      success: true,
      message: `?? ${targetLabel} ya no es administrador.`,
      mentions: [targetJid],
    }
  } catch (e) {
    console.error('Error en /demote:', e)
    return { success: false, message: ' Error al degradar al usuario.' }
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

    if (admins.length === 0) return { success: true, message: '?? No hay administradores en este grupo.' }

    const list = admins.map((a, i) => `${i + 1}. ${formatMentionWithName(a.id, metadata)}`).join('\n')
    const mentions = admins.map((a) => a.id)
    const text = `👑 *Administradores del Grupo*\n\n${list}`

    return { success: true, message: text, mentions }
  } catch (e) {
    console.error('Error en /admins:', e)
    return { success: false, message: '? Error al obtener administradores.' }
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

// =========================
// FUNCIONALIDADES WILEYS PARA GRUPOS + TEMÁTICA BL
// =========================

// Funcionalidades Wileys completas + Temática BL integrada
const BL_GROUP_REACTIONS = ['👥', '💖', '✨', '👑', '💕', '🌸', '💝', '🌟', '🥰', '😍'];
const BL_GROUP_MESSAGES = {
  admin: ['💖 Gestionando con amor...', '✨ Administrando con cariño...', '🌸 Cuidando el grupo...'],
  success: ['✅ ¡Completado! 💖', '🌸 ¡Listo! Todo perfecto', '💕 ¡Éxito! Con mucho amor'],
  error: ['🥺 Algo salió mal, pero no te rindas 💔', '😢 Error detectado, lo siento', '💔 No pude completarlo, perdóname']
};

// Wileys: Reacciones automáticas BL mejoradas para grupos
const addBLGroupReaction = async (sock, message, type = 'group') => {
  try {
    if (!sock || !message?.key) return;

    const reactionSequences = {
      group: ['👥', '💖', '✨'],
      admin: ['👑', '💕', '🌸'],
      kick: ['⚠️', '💔', '🥺'],
      promote: ['👑', '🎉', '💖'],
      welcome: ['👋', '💖', '🌸'],
      rules: ['📋', '✨', '💝']
    };

    const sequence = reactionSequences[type] || reactionSequences.group;

    // Aplicar secuencia de reacciones con timing BL
    for (let i = 0; i < sequence.length; i++) {
      setTimeout(async () => {
        await sock.sendMessage(message.key.remoteJid, {
          react: { text: sequence[i], key: message.key }
        });
      }, i * 1000);
    }
  } catch (error) {
    console.error('[BL_GROUP_REACTION] Error:', error);
  }
};

// Wileys: Decoración BL para mensajes de grupo
const decorateBLGroupMessage = (title, content, style = 'love') => {
  const styles = {
    love: {
      header: '╔💖═══════════════════════════════════════💖╗',
      footer: '╚💖═══════════════════════════════════════💖╝',
      bullet: '💖'
    },
    admin: {
      header: '╔👑═══════════════════════════════════════👑╗',
      footer: '╚👑═══════════════════════════════════════👑╝',
      bullet: '👑'
    },
    group: {
      header: '╔👥═══════════════════════════════════════👥╗',
      footer: '╚👥═══════════════════════════════════════👥╝',
      bullet: '👥'
    }
  };

  const currentStyle = styles[style] || styles.love;
  let message = currentStyle.header + '\n';
  message += `║           ${title.padEnd(37)}║\n`;
  message += '║                                     ║\n';

  if (Array.isArray(content)) {
    content.forEach(item => {
      message += `║ ${currentStyle.bullet} ${item.padEnd(35)}║\n`;
    });
  } else {
    const lines = content.split('\n');
    lines.forEach(line => {
      message += `║ ${line.padEnd(37)}║\n`;
    });
  }

  message += currentStyle.footer;
  return message;
};

// Wileys: Mensaje de estado BL para grupos
const createBLGroupStatusMessage = (type) => {
  const messages = BL_GROUP_MESSAGES[type] || BL_GROUP_MESSAGES.admin;
  return messages[Math.floor(Math.random() * messages.length)];
};

// Funcionalidad Wileys: Mensaje de bienvenida automático
export async function welcome(ctx) {
  const { isGroup, remoteJid, sock, message, args } = ctx;
  if (!isGroup) return { success: false, message: 'Este comando solo funciona en grupos.' };

  if (!isUserAdmin(ctx)) {
    return { success: false, message: '⛔ Solo los administradores pueden configurar mensajes de bienvenida.' };
  }

  await addGroupReaction(sock, message, '👋');

  const welcomeText = args.join(' ').trim();
  if (!welcomeText) {
    return {
      success: true,
      message: '👋 *Configurar Mensaje de Bienvenida*\n\nUso: /welcome <mensaje>\nEjemplo: /welcome ¡Bienvenido al grupo! Lee las reglas.'
    };
  }

  // Aquí se guardaría en la base de datos la configuración del grupo
  try {
    await ensureGroupsTable();
    await db('grupos_autorizados')
      .where({ jid: remoteJid })
      .update({
        welcome_message: welcomeText,
        welcome_enabled: true
      });

    return {
      success: true,
      message: `✅ Mensaje de bienvenida configurado:\n\n"${welcomeText}"`
    };
  } catch (error) {
    return { success: false, message: '⚠️ Error al guardar la configuración.' };
  }
}

// Funcionalidad Wileys: Auto-moderación básica
export async function automod(ctx) {
  const { isGroup, remoteJid, sock, message, args } = ctx;
  if (!isGroup) return { success: false, message: 'Este comando solo funciona en grupos.' };

  if (!isUserAdmin(ctx)) {
    return { success: false, message: '⛔ Solo los administradores pueden configurar la auto-moderación.' };
  }

  await addGroupReaction(sock, message, '🛡️');

  const action = args[0]?.toLowerCase();

  if (!action || !['on', 'off', 'status'].includes(action)) {
    return {
      success: true,
      message: '🛡️ *Auto-Moderación*\n\n/automod on - Activar\n/automod off - Desactivar\n/automod status - Ver estado'
    };
  }

  try {
    await ensureGroupsTable();

    if (action === 'status') {
      const group = await db('grupos_autorizados').where({ jid: remoteJid }).first();
      const enabled = group?.automod_enabled || false;
      return {
        success: true,
        message: `🛡️ Auto-moderación: ${enabled ? '🟢 Activada' : '⚪ Desactivada'}`
      };
    }

    const enabled = action === 'on';
    await db('grupos_autorizados')
      .where({ jid: remoteJid })
      .update({ automod_enabled: enabled });

    return {
      success: true,
      message: `🛡️ Auto-moderación ${enabled ? '🟢 activada' : '⚪ desactivada'}`
    };
  } catch (error) {
    return { success: false, message: '⚠️ Error al configurar la auto-moderación.' };
  }
}

// Funcionalidad Wileys: Reglas del grupo
export async function rules(ctx) {
  const { isGroup, remoteJid, sock, message, args } = ctx;
  if (!isGroup) return { success: false, message: 'Este comando solo funciona en grupos.' };

  await addGroupReaction(sock, message, '📋');

  if (args.length === 0) {
    // Mostrar reglas existentes
    try {
      const group = await db('grupos_autorizados').where({ jid: remoteJid }).first();
      const rules = group?.rules || 'No hay reglas configuradas para este grupo.';

      return {
        success: true,
        message: `📋 *Reglas del Grupo*\n\n${rules}`
      };
    } catch (error) {
      return { success: false, message: '⚠️ Error al obtener las reglas.' };
    }
  }

  // Configurar reglas (solo admins)
  if (!isUserAdmin(ctx)) {
    return { success: false, message: '⛔ Solo los administradores pueden configurar las reglas.' };
  }

  const rulesText = args.join(' ').trim();

  try {
    await ensureGroupsTable();
    await db('grupos_autorizados')
      .where({ jid: remoteJid })
      .update({ rules: rulesText });

    return {
      success: true,
      message: `✅ Reglas del grupo actualizadas:\n\n${rulesText}`
    };
  } catch (error) {
    return { success: false, message: '⚠️ Error al guardar las reglas.' };
  }
}

// Funcionalidad Wileys: Información extendida del grupo
export async function groupstats(ctx) {
  const { isGroup, remoteJid, sock, message } = ctx;
  if (!isGroup) return { success: false, message: 'Este comando solo funciona en grupos.' };

  await addGroupReaction(sock, message, '📊');

  try {
    const metadata = await getGroupMetadataCached(sock, remoteJid);
    const participants = metadata?.participants || [];

    const admins = participants.filter(p => p.admin === 'admin' || p.admin === 'superadmin');
    const members = participants.filter(p => !p.admin || p.admin === 'member');

    // Estadísticas adicionales
    const creationDate = metadata?.creation ? new Date(metadata.creation * 1000).toLocaleDateString('es-ES') : 'Desconocida';
    const description = metadata?.desc || 'Sin descripción';

    const stats = [
      '📊 *Estadísticas del Grupo*',
      '',
      `📛 *Nombre:* ${metadata?.subject || 'Sin nombre'}`,
      `👥 *Total miembros:* ${participants.length}`,
      `👑 *Administradores:* ${admins.length}`,
      `👤 *Miembros regulares:* ${members.length}`,
      `📅 *Creado:* ${creationDate}`,
      '',
      `📝 *Descripción:*`,
      description.length > 100 ? description.substring(0, 100) + '...' : description
    ];

    return {
      success: true,
      message: stats.join('\n')
    };
  } catch (error) {
    return { success: false, message: '⚠️ Error al obtener estadísticas del grupo.' };
  }
}

// Funcionalidad Wileys: Limpiar mensajes (simulado)
export async function clean(ctx) {
  const { isGroup, remoteJid, sock, message, args } = ctx;
  if (!isGroup) return { success: false, message: 'Este comando solo funciona en grupos.' };

  if (!isUserAdmin(ctx)) {
    return { success: false, message: '⛔ Solo los administradores pueden usar este comando.' };
  }

  if (!isBotGroupAdmin(ctx)) {
    return { success: false, message: '⛔ El bot necesita ser administrador para limpiar mensajes.' };
  }

  await addGroupReaction(sock, message, '🧹');

  const count = parseInt(args[0]) || 5;
  const maxCount = Math.min(count, 20); // Máximo 20 mensajes

  return {
    success: true,
    message: `🧹 *Limpieza de Mensajes*\n\n⚠️ Esta función está en desarrollo.\nSe limpiarían ${maxCount} mensajes del grupo.\n\n💡 Por ahora, los admins pueden eliminar mensajes manualmente.`
  };
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
  testBotAdmin,
  welcome,
  automod,
  rules,
  groupstats,
  clean
}

// commands/admin.js
// Debug y utilidades de owner/admin usando ctx unificado y helper de metadata

import { getTheme } from '../utils/utils/theme.js'
import { setPrimaryOwner } from '../config/global-config.js'
import { getGroupRoles, getGroupMetadataCached } from '../utils/utils/group-helper.js'

export async function ownerInfo(ctx) {
  const th = getTheme()
  const roles = ctx.isOwner ? ['owner'] : []
  const msg = `${th.header('TU PERFIL')}\n+${ctx.usuarioNumber}\nRoles: ${roles.join(', ') || 'ninguno'}\n${th.footer()}`
  return { success: true, message: msg }
}

export async function checkOwner(ctx) {
  if (!ctx.isOwner) {
    return { success: false, message: '❌ No tienes el rol de owner.' }
  }
  return { success: true, message: '✅ Tienes el rol de owner.' }
}

export async function setOwner(ctx) {
  if (!ctx.isOwner) {
    return { success: false, message: 'Este comando solo puede ser usado por el owner del bot.' }
  }

  const numero = String(ctx.args?.[0] || '').replace(/\D/g, '')
  const nombre = ctx.args?.slice(1).join(' ') || 'Owner'

  if (!numero) {
    return { success: false, message: '❌ Uso: /setowner <número> <nombre>' }
  }

  setPrimaryOwner(numero, nombre)
  return { success: true, message: `✅ Owner principal configurado: ${nombre} (+${numero})` }
}

export async function debugBot(ctx) {
  try {
    const th = getTheme()
    const botNumber = String(ctx.sock?.user?.id || '').replace(/\D/g, '')
    const envOwner = String(process.env.OWNER_WHATSAPP_NUMBER || '').replace(/\D/g, '')
    const rolesOwner = ctx.isOwner ? ['owner'] : []

    let isAdmin = !!ctx.isAdmin
    let isBotAdmin = !!ctx.isBotAdmin
    let hasGroupMetadata = !!ctx.groupMetadata

    if (ctx.isGroup && ctx.sock && ctx.remoteJid && ctx.sender) {
      try {
        const roles = await getGroupRoles(ctx.sock, ctx.remoteJid, ctx.sender)
        isAdmin = roles.isAdmin
        isBotAdmin = roles.isBotAdmin
        const meta = await getGroupMetadataCached(ctx.sock, ctx.remoteJid)
        hasGroupMetadata = !!meta
      } catch (e) {
        console.error('Error obteniendo metadata:', e)
      }
    }

    const userAdmin = isAdmin ? 'admin del grupo' : 'miembro'

    const body = [
      `🤖 Debug del Bot`,
      `Bot JID: ${ctx.sock?.user?.id || '(n/a)'}`,
      `Numero Base: +${botNumber || '(n/a)'}`,
      `Owner (env): +${envOwner || '(n/a)'}`,
      `Tu: +${ctx.usuarioNumber} ${rolesOwner.length ? `(${rolesOwner.join(', ')})` : ''}`,
      `Tu estatus: ${userAdmin}`,
      ctx.isGroup ? `Bot Admin en grupo: ${isBotAdmin ? 'Sí ✅' : 'No ❌'}` : null,
      ctx.isGroup ? `Grupo metadata disponible: ${hasGroupMetadata ? 'Sí ✅' : 'No ❌'}` : null,
    ]
      .filter(Boolean)
      .join('\n')

    const msg = `${th.header('KONMI BOT')}\n${body}\n${th.footer()}`
    return { success: true, message: msg }
  } catch (e) {
    return { success: false, message: `⚠️ Error en /debugbot: ${e?.message || e}` }
  }
}

// Alias y otros comandos de debug
export const testAdmin = checkOwner
export const debugMe = ownerInfo
export const debugFull = ownerInfo

export default { ownerInfo, checkOwner, setOwner, debugBot, testAdmin, debugMe, debugFull }

import { isGroupAdmin, isBotAdmin, isOwnerNumber, normalizeDigits } from '../utils/identity.js'
// commands/group-admin-extra.js — Acciones administrativas del grupo

function requireGroupAdmin(handler){
  return async (ctx) => {
    const { isGroup, usuario, remoteJid, sock, message } = ctx
    if (!isGroup) return { success:true, message:'ℹ️ Este comando solo funciona en grupos', quoted:true }
    const fromMe = !!(message?.key?.fromMe)
    const ok = fromMe || (await isGroupAdmin(sock, remoteJid, usuario)) || isOwnerNumber(usuario, sock)
    if (!ok) return { success:true, message:'⛔ Solo administradores del grupo u owner pueden usar este comando.', quoted:true }
    const botOk = await isBotAdmin(sock, remoteJid)
    if (!botOk) return { success:true, message:'⛔ El bot no es administrador del grupo. Otórgale admin para ejecutar este comando.', quoted:true }
    return handler(ctx)
  }
}

export const muteall = requireGroupAdmin(async ({ sock, remoteJid, args }) => {
  const on = String((args||[])[0]||'').toLowerCase()
  if (!['on','off','true','false','1','0'].includes(on)) return { success:true, message:'ℹ️ Uso: /muteall on|off', quoted:true }
  const val = ['on','true','1'].includes(on)
  try { await sock.groupSettingUpdate(remoteJid, 'announcement', val) } catch {}
  return { success:true, message:`🔇 Solo admins pueden enviar mensajes: ${val?'ON':'OFF'}`, quoted:true }
})

export const lockinfo = requireGroupAdmin(async ({ sock, remoteJid, args }) => {
  const on = String((args||[])[0]||'').toLowerCase()
  if (!['on','off','true','false','1','0'].includes(on)) return { success:true, message:'ℹ️ Uso: /lockinfo on|off', quoted:true }
  const val = ['on','true','1'].includes(on)
  try { await sock.groupSettingUpdate(remoteJid, 'locked', val) } catch {}
  return { success:true, message:`🔒 Solo admins pueden editar info: ${val?'ON':'OFF'}`, quoted:true }
})

export const subject = requireGroupAdmin(async ({ sock, remoteJid, args }) => {
  const text = (args||[]).join(' ').trim()
  if (!text) return { success:true, message:'ℹ️ Uso: /subject [nuevo título]', quoted:true }
  try { await sock.groupUpdateSubject(remoteJid, text); return { success:true, message:'✅ Título actualizado', quoted:true } } catch { return { success:false, message:'⚠️ Error actualizando título', quoted:true } }
})

export const desc = requireGroupAdmin(async ({ sock, remoteJid, args }) => {
  const text = (args||[]).join(' ').trim()
  if (!text) return { success:true, message:'ℹ️ Uso: /desc [nueva descripción]', quoted:true }
  try { await sock.groupUpdateDescription(remoteJid, text); return { success:true, message:'✅ Descripción actualizada', quoted:true } } catch { return { success:false, message:'⚠️ Error actualizando descripción', quoted:true } }
})

export const invite = requireGroupAdmin(async ({ sock, remoteJid }) => {
  try { const code = await sock.groupInviteCode(remoteJid); const url = `https://chat.whatsapp.com/${code}`; return { success:true, message:`🔗 Invitación: ${url}`, quoted:true } } catch { return { success:false, message:'⚠️ No pude obtener el enlace', quoted:true } }
})

export default { muteall, lockinfo, subject, desc, invite }




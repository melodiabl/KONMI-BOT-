// commands/group-extra.js — tagall y groupinfo

function formatDate(d){ try { return new Date(d).toLocaleString('es-ES') } catch { return String(d||'') } }

export async function tagall(ctx){
  const { sock, remoteJid } = ctx
  try {
    const meta = await sock.groupMetadata(remoteJid)
    const parts = meta?.participants || []
    const mentions = parts.map(p => p.id).slice(0, 200)
    const chunks = []
    const getName = (jid) => {
      try {
        const p = parts.find(x => x?.id === jid)
        return p?.notify || p?.name || null
      } catch { return null }
    }
    for (let i=0; i<mentions.length; i+=25) chunks.push(mentions.slice(i, i+25))
    for (const chunk of chunks) {
      const text = chunk.map(j=>{
        const num = String(j).split('@')[0]
        const name = getName(j)
        return name ? `@${num} (${name})` : `@${num}`
      }).join(' ')
      await sock.sendMessage(remoteJid, { text, mentions: chunk })
    }
    return { success:true, message:`?? Taggeados ${mentions.length} miembros`, quoted:true }
  } catch { return { success:false, message:'?? No pude mencionar a todos', quoted:true } }
}


import { getTheme } from '../utils/utils/theme.js'

export async function groupinfo(ctx){
  const { sock, remoteJid } = ctx
  try {
    const th = getTheme()
    const meta = await sock.groupMetadata(remoteJid)
    const subject = meta?.subject || 'Grupo'
    const size = (meta?.participants||[]).length
    const desc = meta?.desc || meta?.descId || '-'
    const owner = meta?.owner || '-'
    const body = `👥 ${subject}\nID: ${remoteJid}\nMiembros: ${size}\nOwner: ${owner}\n\nDescripción:\n${desc}`
    const text = `${th.header('INFO DE GRUPO')}\n${body}\n${th.footer()}`
    return { success:true, message: text, quoted:true }
  } catch { return { success:false, message:'⚠️ No pude obtener info del grupo', quoted:true } }
}

export default { tagall, groupinfo }

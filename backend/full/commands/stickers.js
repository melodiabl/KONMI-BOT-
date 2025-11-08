// commands/stickers.js — utilidades de stickers
import { downloadContentFromMessage } from '@whiskeysockets/baileys'

export async function stickerurl({ args }) {
  const url = (args||[])[0]
  if (!url || !/^https?:\/\//i.test(url)) return { success:true, message:'ℹ️ Uso: /stickerurl <url .webp>', quoted:true }
  // Enviamos como sticker directamente; idealmente .webp
  return { success:true, type:'sticker', sticker: { url }, quoted:true }
}

export async function toimg({ sock, message }) {
  try {
    const root = message?.message || {}
    const quoted = root?.extendedTextMessage?.contextInfo?.quotedMessage || null
    const st = root?.stickerMessage || quoted?.stickerMessage || null
    if (!st) return { success:true, message:'ℹ️ Responde a un sticker con /toimg', quoted:true }
    const stream = await downloadContentFromMessage(st, 'sticker')
    const chunks = []
    for await (const c of stream) chunks.push(c)
    const buf = Buffer.concat(chunks)
    // Enviar como imagen
    await sock.sendMessage(message.key.remoteJid, { image: buf, caption: '🖼️ Sticker → Imagen' }, { quoted: message })
    return { success:true, message:'✅ Convertido', quoted:true }
  } catch (e) {
    return { success:false, message:`⚠️ No pude convertir: ${e?.message||e}`, quoted:true }
  }
}

export async function sticker({ sock, message }){
  try {
    const root = message?.message || {}
    const quoted = root?.extendedTextMessage?.contextInfo?.quotedMessage || null
    const im = root?.imageMessage || quoted?.imageMessage || null
    const vm = root?.videoMessage || quoted?.videoMessage || null
    const media = im || vm
    if (!media) return { success:true, message:'ℹ️ Responde a una imagen/video con /sticker', quoted:true }
    const kind = im ? 'image' : 'video'
    const stream = await downloadContentFromMessage(media, kind)
    const chunks = []; for await (const c of stream) chunks.push(c)
    const buf = Buffer.concat(chunks)
    // Algunos forks convierten a webp automáticamente; intentamos directo
    await sock.sendMessage(message.key.remoteJid, { sticker: buf }, { quoted: message })
    return { success:true, message:'✅ Sticker enviado', quoted:true }
  } catch (e) {
    return { success:false, message:`⚠️ No pude crear sticker: ${e?.message||e}`, quoted:true }
  }
}

export default { stickerurl, toimg }

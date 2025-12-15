// commands/promo.js — Enlace con vista enriquecida (externalAdReply)

export async function promo({ args }){
  const [url, ...rest] = (args||[])
  const title = rest.join(' ').trim() || 'Visitar enlace'
  if (!url || !/^https?:\/\//i.test(url)) {
    return { success:true, message:'ℹ️ Uso: /promo <url> [titulo]', quoted:true }
  }
  const externalAdReply = {
    title,
    body: url,
    mediaType: 1,
    thumbnail: undefined,
    renderLargerThumbnail: false,
    showAdAttribution: false,
    sourceUrl: url,
    mediaUrl: url,
  }
  return { success:true, message: `🔗 ${title}\n${url}`, externalAdReply, quoted:true }
}

export default { promo }


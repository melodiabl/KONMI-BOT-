// commands/demo.js

export async function poll({ args }) {
  const text = (args||[]).join(' ').trim()
  const parts = text.split('|').map(s=>s.trim()).filter(Boolean)
  const title = parts.shift() || 'Encuesta'
  const options = parts.length ? parts : ['Sí', 'No']
  return { type: 'poll', title, options, quoted: true, ephemeralDuration: 300 }
}

export async function location({ args }) {
  const lat = Number(args?.[0] || 0)
  const lon = Number(args?.[1] || 0)
  const name = (args||[]).slice(2).join(' ').trim() || 'Ubicación'
  return { type: 'location', lat, lon, name, quoted: true }
}

export async function contact({ args }) {
  const phone = (args?.[0]||'').replace(/\D/g,'')
  const name = (args||[]).slice(1).join(' ').trim() || `+${phone}`
  return { type: 'contact', contact: { name, phone }, quoted: true }
}

export async function buttons() {
  return {
    type: 'buttons',
    text: 'Demo de botones',
    footer: 'KONMI BOT',
    buttons: [
      { text: '📋 Ayuda', command: '/help' },
      { text: '🏠 Menú', command: '/menu' },
      { text: '🤖 Mis Subbots', command: '/mybots' },
    ],
    quoted: true,
  }
}

export async function listdemo() {
  return {
    type: 'list',
    text: 'Demo de lista',
    buttonText: 'Abrir',
    sections: [
      { title: 'Emparejamiento', rows: [ { title:'Pairing Code', id:'/code' }, { title:'QR Subbot', id:'/qr' } ] },
      { title: 'Otros', rows: [ { title:'Menú', id:'/menu' }, { title:'Ayuda', id:'/help' } ] },
    ],
    quoted: true,
  }
}

export default { poll, location, contact, buttons, listdemo }


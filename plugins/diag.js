// commands/diag.js — Autodiagnóstico simple de formatos de mensaje
import { buildQuickReplyFlow } from './utils/flows.js'

export async function selftest({ remoteJid, usuario, args }) {
  const results = []
  // 1) Texto simple
  results.push({ success: true, message: `✅ Texto OK\n\nChat: ${remoteJid}\nTú: ${usuario}`, quoted: true })
  // 2) Botones (templateButtons)
  results.push({
    type: 'buttons',
    text: '✅ Botones (template) — Toca una opción',
    footer: 'Diag',
    buttons: [
      { text: 'Ping', command: '/test' },
      { text: 'Ayuda', command: '/help' },
      { text: 'Menú', command: '/menu' },
    ],
    quoted: true,
  })
  // 3) Lista (ListMessage)
  results.push({
    type: 'list',
    text: '✅ Lista (listMessage)',
    buttonText: 'Abrir lista',
    sections: [
      { title: 'Básicos', rows: [ { title: 'Ayuda', id: '/help' }, { title: 'Menú', id: '/menu' } ] },
      { title: 'Diag', rows: [ { title: 'Ping', id: '/test' } ] }
    ],
    quoted: true,
  })
  // 4) Native Flow (quick reply)
  const flow = buildQuickReplyFlow({
    header: '✅ Native Flow',
    body: 'Prueba de botones nativos',
    footer: 'Diag',
    buttons: [
      { text: 'Ayuda', command: '/help' },
      { text: 'Menú', command: '/menu' },
      { text: 'Ping', command: '/test' },
    ],
  })
  results.push({ type: 'content', content: flow, quoted: true })
  // Modo FULL: menú de pruebas rápidas
  const mode = String((args||[])[0]||'').toLowerCase()
  if (mode === 'full') {
    results.push({
      type: 'buttons',
      text: '🧪 Pruebas rápidas',
      footer: 'Diag',
      buttons: [
        { text: 'Admins', command: '/admins' },
        { text: 'Quién soy', command: '/whoami' },
        { text: 'Debug Bot', command: '/debugbot' },
      ],
      quoted: true,
    })
  }
  return results
}

export default { selftest }

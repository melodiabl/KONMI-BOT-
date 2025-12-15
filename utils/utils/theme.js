// utils/theme.js
// Temas de formateo para textos bonitos en WhatsApp (sin colores, con emojis)

import { fancyBold } from './styling.js'

function pickThemeName() {
  const raw = (process.env.BOT_THEME || process.env.THEME || 'pride').toLowerCase().trim()
  return raw
}

export function getTheme() {
  const name = pickThemeName()
  // Temas disponibles: pride (default), soft, neon
  const pride = {
    name: 'pride',
    accent: '🌈',
    bullet: '✦',
    header: (title='KONMI BOT') => `╔════════ ${fancyBold(title)} ════════╗`,
    footer: () => '╚══════════════════════════════╝',
    strings: {
      helpTitle: 'Ayuda por categorías',
      viewOptions: 'Ver opciones',
    },
  }
  const soft = {
    name: 'soft',
    accent: '💫',
    bullet: '•',
    header: (title='KONMI BOT') => `┏━ ${fancyBold(title)} ━┓`,
    footer: () => '┗━━━━━━━━━━━━━━━━━━━━┛',
    strings: {
      helpTitle: 'Menú de ayuda',
      viewOptions: 'Ver categorías',
    },
  }
  const neon = {
    name: 'neon',
    accent: '🔮',
    bullet: '◆',
    header: (title='KONMI BOT') => `〈 ${fancyBold(title)} 〉`,
    footer: () => '— — — — — — — —',
    strings: {
      helpTitle: 'Comandos disponibles',
      viewOptions: 'Abrir menú',
    },
  }
  const map = { pride, soft, neon }
  return map[name] || pride
}

export default { getTheme }


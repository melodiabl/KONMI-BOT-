import { listUserSubbots } from './services/subbot-manager.js'
import { normalizeDigits } from './utils/user.js'

export async function mybots({ usuario }) {
  try {
    const phone = normalizeDigits(usuario)
    const rows = await listUserSubbots(phone)

    if (!rows.length) return { success: true, message: '📦 No tienes subbots creados.' }

    let msg = `🤖 *Mis Subbots* (${rows.length})\n\n`
    rows.forEach((r, i) => {
      const online =
        (r.status || '').toLowerCase() === 'connected' ||
        r.is_active === 1 ||
        r.is_active === true ||
        r.is_online === true
      const type = r.type || r.method || r.connection_type || 'qr'
      const metadata =
        typeof r.metadata === 'string'
          ? JSON.parse(r.metadata || '{}')
          : r.metadata || {}

      const pairingCode = metadata.pairingCode || '-'
      const pushName = metadata.creatorPushName || 'Sin nombre'
      const displayName = `KONMISUB(${pushName})`

      msg += `${i + 1}. *Código:* ${pairingCode}\n`
      msg += `   *Identificación:* ${displayName}\n`
      msg += `   *Tipo:* ${type}\n`
      msg += `   *Estado:* ${online ? '🟢 Online' : '⚪ Offline'}\n`
      msg += '\n'
    })

    return { success: true, message: msg.trim() }
  } catch (e) {
    console.error('Error en mybots:', e)
    return { success: false, message: '⚠️ Error listando tus subbots.' }
  }
}

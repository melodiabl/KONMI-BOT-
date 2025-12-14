// src/commands/bots.js
import { listAllSubbots } from '../services/subbot-manager.js'
import { isOwner } from './utils/user.js'

async function bots({ usuario }) {
  if (!isOwner(usuario)) {
    return {
      text: '⛔ Solo el owner puede ver todos los subbots del sistema.',
    }
  }

  try {
    const rows = await listAllSubbots()

    if (!rows.length)
      return { text: '📦 No hay subbots en el sistema.' }

    let msg = `🤖 *Todos los Subbots del Sistema* (${rows.length})\n\n`
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
      const ownerNumber = r.owner_number || 'Desconocido'

      msg += `${i + 1}. *Código:* ${pairingCode}\n`
      msg += `   *Identificación:* ${displayName}\n`
      msg += `   *Owner:* ${ownerNumber}\n`
      msg += `   *Tipo:* ${type}\n`
      msg += `   *Estado:* ${online ? '🟢 Online' : '⚪ Offline'}\n`
      msg += '\n'
    })

    return { text: msg.trim() }
  } catch (e) {
    return { text: '⚠️ Error listando subbots del sistema.' }
  }
}

export default {
    name: 'bots',
    description: 'Muestra todos los subbots del sistema (solo owner).',
    category: 'admin',
    handler: bots
};

import { sendInteractiveButtons, humanBytes } from './utils/interactive.js'
import os from 'os'
import {
  getConnectionStatus,
  getBotStatus,
} from '../../whatsapp.js'

export async function status(ctx) {
  const st = getConnectionStatus()
  const bot = getBotStatus()
  const mem = process.memoryUsage()
  const load = os.loadavg?.() || []

  const buttons = [
    { text: '📊 Estado Completo', command: '/status-full' },
    { text: '🖥️ Info del Servidor', command: '/serverinfo' },
    { text: '🔧 Hardware', command: '/hardware' },
    { text: '⏱️ Runtime', command: '/runtime' },
    { text: '⚡ Ping', command: '/ping' },
  ]

  let msg = '📊 *ESTADO DEL BOT*\n\n'
  msg += `🤖 Conexión: ${
    bot.connected ? '✅ Conectado' : '❌ ' + bot.connectionStatus
  }\n`
  if (bot.pairingNumber) msg += `🔢 Pairing: ${bot.pairingNumber}\n`
  if (bot.qrCode) msg += `📱 QR: ✅ Disponible\n`
  msg += `⏰ Uptime: ${
    st.status === 'connected' ? Math.round(process.uptime()) + 's' : '0s'
  }\n`
  msg += `💾 Memoria: RSS ${humanBytes(mem.rss)}, Heap ${humanBytes(
    mem.heapUsed,
  )}\n`
  if (load.length)
    msg += `⚡ Carga CPU: ${load.map((n) => n.toFixed(2)).join(' | ')}\n\n`
  msg += 'Selecciona una opción para más detalles:'

  return sendInteractiveButtons(msg, buttons)
}

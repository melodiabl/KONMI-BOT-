// commands/maintenance.js
// Mantenimiento: update (owner/superadmin): notifica y programa reinicio suave

import { spawn } from 'child_process'
import { isSuperAdmin } from '../global-config.js'
import { listRuntimeSubbots, stopSubbotRuntime } from '../lib/subbots.js'

export async function update(ctx) {
  const { isOwner, usuario } = ctx;
  try {
    const allowed = isOwner || isSuperAdmin(usuario);
    if (!allowed) {
      return { message: '⛔ Solo el owner puede ejecutar /update' };
    }

    // Intentar detener subbots si hay en ejecución (best-effort)
    try {
      const running = listRuntimeSubbots?.() || []
      for (const r of running) {
        try { await stopSubbotRuntime(r.code || r.id || r.session_id) } catch {}
      }
    } catch {}

    // Opcional: preparación para git/npm (best-effort, no bloqueante)
    try {
      const child = spawn(process.platform === 'win32' ? 'cmd' : 'sh', [process.platform === 'win32' ? '/c' : '-c', 'git rev-parse --is-inside-work-tree 1>nul 2>&1 && git pull && npm ci || exit 0' ], { detached: true, stdio: 'ignore' })
      child.unref?.()
    } catch {}

    // Programar reinicio suave del proceso
    setTimeout(() => { try { process.exit(0) } catch {} }, 1200)

    return { success: true, message: '🔄 Iniciando actualización y reinicio...\n\n• Deteniendo subbots\n• Actualizando (git/npm) si aplica\n• Reiniciando proceso', quoted: true }
  } catch (e) {
    return { success: false, message: `⚠️ Error en /update: ${e?.message || e}`, quoted: true }
  }
}

export default { update }

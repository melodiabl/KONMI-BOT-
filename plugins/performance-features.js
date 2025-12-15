// commands/performance-features.js
// Funcionalidades de optimización y rendimiento usando Baileys

import logger from './config/logger.js'

// Limpiar datos sucios (dirty bits) para mejorar rendimiento
export async function cleanDirtyBits(ctx) {
  const { args, remoteJid, sock, isOwner } = ctx

  if (!isOwner) {
    return { success: false, message: '❌ Solo el owner puede limpiar datos sucios' }
  }

  const type = args[0] || 'account_sync'
  const validTypes = ['account_sync', 'groups']

  if (!validTypes.includes(type)) {
    return {
      success: false,
      message: `❌ Tipo inválido. Opciones: ${validTypes.join(', ')}`
    }
  }

  try {
    await sock.cleanDirtyBits(type)
    return { success: true, message: `✅ Datos sucios de tipo "${type}" limpiados` }
  } catch (error) {
    logger.error('Error limpiando datos sucios:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

// Obtener estadísticas de rendimiento
export async function getPerformanceStats(ctx) {
  const { remoteJid, sock } = ctx

  try {
    const stats = {
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      platform: process.platform,
      nodeVersion: process.version,
      pid: process.pid
    }

    let message = '📊 *Estadísticas de Rendimiento*\n\n'
    message += `⏱️ *Uptime:* ${Math.floor(stats.uptime / 3600)}h ${Math.floor((stats.uptime % 3600) / 60)}m\n`
    message += `💾 *Memoria RSS:* ${(stats.memory.rss / 1024 / 1024).toFixed(2)} MB\n`
    message += `💾 *Memoria Heap:* ${(stats.memory.heapUsed / 1024 / 1024).toFixed(2)} MB\n`
    message += `💾 *Memoria Heap Total:* ${(stats.memory.heapTotal / 1024 / 1024).toFixed(2)} MB\n`
    message += `🖥️ *Plataforma:* ${stats.platform}\n`
    message += `📦 *Node.js:* ${stats.nodeVersion}\n`
    message += `🔢 *PID:* ${stats.pid}\n`

    return { success: true, message }
  } catch (error) {
    logger.error('Error obteniendo estadísticas de rendimiento:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

// Forzar garbage collection (si está disponible)
export async function forceGC(ctx) {
  const { remoteJid, sock, isOwner } = ctx

  if (!isOwner) {
    return { success: false, message: '❌ Solo el owner puede forzar garbage collection' }
  }

  try {
    if (global.gc) {
      const memBefore = process.memoryUsage().heapUsed
      global.gc()
      const memAfter = process.memoryUsage().heapUsed
      const freed = ((memBefore - memAfter) / 1024 / 1024).toFixed(2)

      return {
        success: true,
        message: `✅ Garbage collection completado\n\n💾 *Memoria liberada:* ${freed} MB`
      }
    } else {
      return { success: false, message: '❌ Garbage collection no disponible (ejecuta con --expose-gc)' }
    }
  } catch (error) {
    logger.error('Error forzando garbage collection:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

// Obtener estado de conexión detallado
export async function getConnectionHealth(ctx) {
  const { remoteJid, sock } = ctx

  try {
    const connectionState = sock?.ws?.readyState || 'unknown'
    const user = sock?.user
    const authState = sock?.authState

    let message = '🔗 *Estado de Conexión*\n\n'
    message += `📡 *WebSocket:* ${connectionState}\n`
    message += `👤 *Usuario:* ${user?.id || 'No conectado'}\n`
    message += `📱 *Plataforma:* ${user?.platform || 'Desconocido'}\n`
    message += `🔐 *Autenticado:* ${authState ? '✅' : '❌'}\n`

    // Verificar latencia si es posible
    if (sock?.ws?.ping) {
      message += `⚡ *Latencia:* Verificando...\n`
    }

    return { success: true, message }
  } catch (error) {
    logger.error('Error obteniendo estado de conexión:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

// Optimizar caché de sesiones
export async function optimizeSessions(ctx) {
  const { remoteJid, sock, isOwner } = ctx

  if (!isOwner) {
    return { success: false, message: '❌ Solo el owner puede optimizar sesiones' }
  }

  try {
    // Forzar actualización de sesiones
    await sock.assertSessions([], true)
    return { success: true, message: '✅ Sesiones optimizadas' }
  } catch (error) {
    logger.error('Error optimizando sesiones:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

// Obtener dispositivos conectados
export async function getConnectedDevices(ctx) {
  const { args, remoteJid, sock } = ctx

  const jids = args.length > 0 ? args : [remoteJid.replace('@g.us', '@s.whatsapp.net')]

  try {
    const devices = await sock.getUSyncDevices(jids, true, false)

    if (!devices || devices.length === 0) {
      return { success: false, message: '❌ No se encontraron dispositivos conectados' }
    }

    let message = '📱 *Dispositivos Conectados*\n\n'
    devices.forEach((device, index) => {
      message += `${index + 1}. *JID:* ${device.jid}\n`
      message += `   📱 *Tipo:* ${device.device?.type || 'Desconocido'}\n`
      message += `   🔢 *Número:* ${device.device?.phoneNumber || 'N/D'}\n\n`
    })

    return { success: true, message }
  } catch (error) {
    logger.error('Error obteniendo dispositivos conectados:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

// Limpiar caché de grupos
export async function clearGroupCache(ctx) {
  const { remoteJid, sock, isOwner } = ctx

  if (!isOwner) {
    return { success: false, message: '❌ Solo el owner puede limpiar caché de grupos' }
  }

  try {
    // Limpiar datos sucios de grupos
    await sock.cleanDirtyBits('groups')
    return { success: true, message: '✅ Caché de grupos limpiado' }
  } catch (error) {
    logger.error('Error limpiando caché de grupos:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

// Obtener historial de mensajes (experimental)
export async function getMessageHistory(ctx) {
  const { args, remoteJid, sock, isOwner } = ctx

  if (!isOwner) {
    return { success: false, message: '❌ Solo el owner puede acceder al historial de mensajes' }
  }

  const count = parseInt(args[0]) || 10
  if (count > 100) {
    return { success: false, message: '❌ Máximo 100 mensajes permitidos' }
  }

  try {
    // Esto es experimental y puede no funcionar en todas las versiones
    const history = await sock.fetchMessageHistory(count, null, Date.now())
    return {
      success: true,
      message: `✅ Historial obtenido (${history?.length || 0} mensajes)`
    }
  } catch (error) {
    logger.error('Error obteniendo historial de mensajes:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

export default {
  cleanDirtyBits,
  getPerformanceStats,
  forceGC,
  getConnectionHealth,
  optimizeSessions,
  getConnectedDevices,
  clearGroupCache,
  getMessageHistory
}
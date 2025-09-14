import db from './db.js';
import os from 'os';

/**
 * Handle the /status command to show bot status
 * @param {string} usuario - The user who sent the command
 * @param {string} grupo - The group where the command was sent
 * @param {string} fecha - The date/time of the command
 */
async function handleStatus(usuario, grupo, fecha) {
  try {
    console.log(`📊 Comando /status recibido de ${usuario}`);
    
    // Obtener información del sistema
    const uptime = process.uptime();
    const memoryUsage = process.memoryUsage();
    const cpuUsage = os.loadavg();
    const freeMemory = os.freemem();
    const totalMemory = os.totalmem();
    const usedMemory = totalMemory - freeMemory;
    
    // Obtener estadísticas de la base de datos
    const totalUsers = await db('usuarios').count('id as count').first();
    const totalSubbots = await db('subbots').count('id as count').first();
    const totalLogs = await db('control_logs').count('id as count').first();
    const totalAportes = await db('aportes').count('id as count').first();
    const totalPedidos = await db('pedidos').count('id as count').first();

    // Obtener sub-bots activos
    const activeSubbots = await db('subbots')
      .where('status', 'connected')
      .count('id as count')
      .first();

    // Obtener logs de las últimas 24 horas
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const recentLogs = await db('control_logs')
      .where('fecha', '>=', yesterday.toISOString())
      .count('id as count')
      .first();

    // Formatear tiempo de actividad
    const formatUptime = (seconds) => {
      const days = Math.floor(seconds / 86400);
      const hours = Math.floor((seconds % 86400) / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      const secs = Math.floor(seconds % 60);
      
      if (days > 0) return `${days}d ${hours}h ${minutes}m ${secs}s`;
      if (hours > 0) return `${hours}h ${minutes}m ${secs}s`;
      if (minutes > 0) return `${minutes}m ${secs}s`;
      return `${secs}s`;
    };

    // Formatear memoria
    const formatBytes = (bytes) => {
      const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
      if (bytes === 0) return '0 Bytes';
      const i = Math.floor(Math.log(bytes) / Math.log(1024));
      return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
    };

    const message = `╭─❍「 📊 Melodia Status ✦ 」
│
├─ 🤖 *Bot Principal*
├─ ⏰ *Uptime:* ${formatUptime(uptime)}
├─ 💾 *Memoria:* ${formatBytes(memoryUsage.heapUsed)} / ${formatBytes(memoryUsage.heapTotal)}
├─ 🖥️ *Sistema:* ${formatBytes(usedMemory)} / ${formatBytes(totalMemory)} (${Math.round((usedMemory / totalMemory) * 100)}%)
├─ 📈 *CPU Load:* ${cpuUsage[0].toFixed(2)} (1m), ${cpuUsage[1].toFixed(2)} (5m), ${cpuUsage[2].toFixed(2)} (15m)
│
├─ 📊 *Estadísticas*
├─ 👥 *Usuarios:* ${totalUsers.count}
├─ 🤖 *Sub-bots:* ${totalSubbots.count} (${activeSubbots.count} activos)
├─ 📝 *Logs:* ${totalLogs.count} (${recentLogs.count} últimas 24h)
├─ 📋 *Aportes:* ${totalAportes.count}
├─ 🛒 *Pedidos:* ${totalPedidos.count}
│
├─ 🌐 *Sistema*
├─ 🖥️ *OS:* ${os.type()} ${os.release()}
├─ 🏗️ *Arquitectura:* ${os.arch()}
├─ 💻 *Plataforma:* ${os.platform()}
├─ 🏠 *Directorio:* ${process.cwd()}
│
├─ 💫 *Estado de Melodia*
╰─✦`;

    return { 
      success: true, 
      message 
    };
  } catch (error) {
    console.error('Error en status:', error);
    return { 
      success: false, 
      message: '❌ *Error al obtener estado*' 
    };
  }
}

/**
 * Handle the /ping command to test bot responsiveness
 * @param {string} usuario - The user who sent the command
 * @param {string} grupo - The group where the command was sent
 * @param {string} fecha - The date/time of the command
 */
async function handlePing(usuario, grupo, fecha) {
  try {
    console.log(`🏓 Comando /ping recibido de ${usuario}`);
    
    const startTime = Date.now();
    
    // Simular un pequeño delay para calcular ping
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const endTime = Date.now();
    const ping = endTime - startTime;
    
    return { 
      success: true, 
      message: `╭─❍「 🏓 Melodia Ping ✦ 」
│
├─ 🏓 *Pong!*
├─ ⚡ *Latencia:* ${ping}ms
├─ ⏰ *Hora:* ${new Date().toLocaleString()}
│
├─ 💫 *Melodia está activa*
╰─✦` 
    };
  } catch (error) {
    console.error('Error en ping:', error);
    return { 
      success: false, 
      message: '❌ *Error en ping*' 
    };
  }
}

export {
  handleStatus,
  handlePing
};

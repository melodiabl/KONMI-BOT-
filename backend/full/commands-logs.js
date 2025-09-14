import db from './db-connection.js';
import fs from 'fs';
import path from 'path';

/**
 * Handle the /logs command to view system logs
 * @param {string} type - Type of logs to view
 * @param {string} usuario - The user who sent the command
 * @param {string} grupo - The group where the command was sent
 * @param {string} fecha - The date/time of the command
 */
async function handleLogs(type, usuario, grupo, fecha) {
  try {
    console.log(`📋 Comando /logs recibido de ${usuario}: "${type}"`);
    
    // Verificar si el usuario es admin
    const whatsappNumber = usuario.split('@')[0];
    const user = await db('usuarios').where({ whatsapp_number: whatsappNumber }).select('rol').first();
    
    if (!user || user.rol !== 'admin') {
      return { 
        success: true, 
        message: '❌ *Solo administradores pueden ver logs*' 
      };
    }

    const validTypes = ['all', 'errors', 'commands', 'users', 'system'];
    const logType = type && validTypes.includes(type.toLowerCase()) ? type.toLowerCase() : 'all';

    let logs = [];
    let title = '';

    switch (logType) {
      case 'errors':
        logs = await db('control_logs')
          .where('accion', 'like', '%ERROR%')
          .orderBy('fecha', 'desc')
          .limit(20);
        title = '🚨 Logs de Errores';
        break;
        
      case 'commands':
        logs = await db('control_logs')
          .whereIn('accion', ['AI_QUERY', 'CREATE_SUBBOT', 'DELETE_SUBBOT', 'CLEAN_SESSION'])
          .orderBy('fecha', 'desc')
          .limit(20);
        title = '⚡ Logs de Comandos';
        break;
        
      case 'users':
        logs = await db('control_logs')
          .where('accion', 'like', '%USER%')
          .orderBy('fecha', 'desc')
          .limit(20);
        title = '👥 Logs de Usuarios';
        break;
        
      case 'system':
        logs = await db('control_logs')
          .whereIn('accion', ['SYSTEM_START', 'SYSTEM_STOP', 'BOT_RESTART'])
          .orderBy('fecha', 'desc')
          .limit(20);
        title = '🔧 Logs del Sistema';
        break;
        
      default: // all
        logs = await db('control_logs')
          .orderBy('fecha', 'desc')
          .limit(30);
        title = '📋 Todos los Logs';
    }

    if (logs.length === 0) {
      return { 
        success: true, 
        message: `╭─❍「 ${title} ✦ 」
│
├─ No hay logs de este tipo disponibles
├─ Los logs aparecerán aquí cuando ocurran eventos
│
╰─✦` 
      };
    }

    let message = `╭─❍「 ${title} ✦ 」
│
├─ 📊 *Total de logs:* ${logs.length}
├─ 📅 *Última actualización:* ${new Date().toLocaleString()}
│
`;

    logs.forEach((log, index) => {
      const fecha = new Date(log.fecha).toLocaleString();
      const accion = log.accion.replace(/_/g, ' ').toLowerCase();
      const detalles = log.detalles.length > 50 ? 
        log.detalles.substring(0, 50) + '...' : 
        log.detalles;
      
      message += `├─ ${index + 1}. *${accion}*\n`;
      message += `│   📅 ${fecha}\n`;
      message += `│   👤 ${log.usuario}\n`;
      message += `│   📝 ${detalles}\n\n`;
    });

    message += `╰─✦`;

    return { 
      success: true, 
      message 
    };
  } catch (error) {
    console.error('Error en logs:', error);
    return { 
      success: false, 
      message: '❌ *Error al obtener logs*' 
    };
  }
}

/**
 * Handle the /stats command to view bot statistics
 * @param {string} usuario - The user who sent the command
 * @param {string} grupo - The group where the command was sent
 * @param {string} fecha - The date/time of the command
 */
async function handleStats(usuario, grupo, fecha) {
  try {
    console.log(`📊 Comando /stats recibido de ${usuario}`);
    
    // Verificar si el usuario es admin
    const whatsappNumber = usuario.split('@')[0];
    const user = await db('usuarios').where({ whatsapp_number: whatsappNumber }).select('rol').first();
    
    if (!user || user.rol !== 'admin') {
      return { 
        success: true, 
        message: '❌ *Solo administradores pueden ver estadísticas*' 
      };
    }

    // Obtener estadísticas
    const totalUsers = await db('usuarios').count('id as count').first();
    const totalLogs = await db('control_logs').count('id as count').first();
    const totalSubbots = await db('subbots').count('id as count').first();
    const totalAportes = await db('aportes').count('id as count').first();
    const totalPedidos = await db('pedidos').count('id as count').first();

    // Obtener logs de las últimas 24 horas
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const recentLogs = await db('control_logs')
      .where('fecha', '>=', yesterday.toISOString())
      .count('id as count')
      .first();

    // Obtener comandos más usados
    const topCommands = await db('control_logs')
      .select('accion')
      .count('id as count')
      .groupBy('accion')
      .orderBy('count', 'desc')
      .limit(5);

    let message = `╭─❍「 📊 KONMI Stats ✦ 」
│
├─ 👥 *Usuarios registrados:* ${totalUsers.count}
├─ 🤖 *Sub-bots activos:* ${totalSubbots.count}
├─ 📝 *Total de logs:* ${totalLogs.count}
├─ 📋 *Aportes:* ${totalAportes.count}
├─ 🛒 *Pedidos:* ${totalPedidos.count}
├─ ⏰ *Logs últimas 24h:* ${recentLogs.count}
│
├─ 🔥 *Comandos más usados:*
`;

    topCommands.forEach((cmd, index) => {
      const accion = cmd.accion.replace(/_/g, ' ').toLowerCase();
      message += `├─ ${index + 1}. ${accion} (${cmd.count})\n`;
    });

    message += `│
├─ 💫 *Estadísticas de KONMI*
╰─✦`;

    return { 
      success: true, 
      message 
    };
  } catch (error) {
    console.error('Error en stats:', error);
    return { 
      success: false, 
      message: '❌ *Error al obtener estadísticas*' 
    };
  }
}

/**
 * Handle the /export command to export logs
 * @param {string} format - Export format (json, csv, txt)
 * @param {string} usuario - The user who sent the command
 * @param {string} grupo - The group where the command was sent
 * @param {string} fecha - The date/time of the command
 */
async function handleExport(format, usuario, grupo, fecha) {
  try {
    console.log(`📤 Comando /export recibido de ${usuario}: "${format}"`);
    
    // Verificar si el usuario es admin
    const whatsappNumber = usuario.split('@')[0];
    const user = await db('usuarios').where({ whatsapp_number: whatsappNumber }).select('rol').first();
    
    if (!user || user.rol !== 'admin') {
      return { 
        success: true, 
        message: '❌ *Solo administradores pueden exportar logs*' 
      };
    }

    if (!format || !['json', 'csv', 'txt'].includes(format.toLowerCase())) {
      return { 
        success: true, 
        message: `╭─❍「 📤 KONMI Export ✦ 」
│
├─ ¡KONMI puede exportar logs! 📤
├─ Especifica el formato~ ♡
│
├─ Formatos disponibles:
│   ⇝ .export json
│   ⇝ .export csv
│   ⇝ .export txt
│
╰─✦` 
      };
    }

    const logs = await db('control_logs')
      .orderBy('fecha', 'desc')
      .limit(1000);

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `logs-${timestamp}.${format}`;
    const filepath = path.join(process.cwd(), 'exports', filename);

    // Crear directorio de exports si no existe
    const exportsDir = path.join(process.cwd(), 'exports');
    if (!fs.existsSync(exportsDir)) {
      fs.mkdirSync(exportsDir, { recursive: true });
    }

    let content = '';
    switch (format.toLowerCase()) {
      case 'json':
        content = JSON.stringify(logs, null, 2);
        break;
      case 'csv':
        content = 'id,usuario,accion,detalles,grupo,fecha\n';
        logs.forEach(log => {
          content += `${log.id},${log.usuario},${log.accion},"${log.detalles}",${log.grupo},${log.fecha}\n`;
        });
        break;
      case 'txt':
        logs.forEach(log => {
          content += `[${log.fecha}] ${log.accion} - ${log.usuario}\n`;
          content += `  ${log.detalles}\n\n`;
        });
        break;
    }

    fs.writeFileSync(filepath, content);

    return { 
      success: true, 
      message: `╭─❍「 📤 KONMI Export ✦ 」
│
├─ ✅ *Archivo exportado:* ${filename}
├─ 📁 *Ubicación:* ${filepath}
├─ 📊 *Registros:* ${logs.length}
├─ 📅 *Fecha:* ${new Date().toLocaleString()}
│
├─ 💫 *Exportado por KONMI*
╰─✦` 
    };
  } catch (error) {
    console.error('Error en export:', error);
    return { 
      success: false, 
      message: '❌ *Error al exportar logs*' 
    };
  }
}

export {
  handleLogs,
  handleStats,
  handleExport
};

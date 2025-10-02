import {
  createSubbot,
  getUserSubbots,
  deleteSubbot,
  getSubbotStatus,
} from './handler.js';

/**
 * Comando /serbot - Crear nuevo subbot
 */
export async function handleSerbot(usuario, grupo, fecha, args = []) {
  try {
    const connectionType = args[0] === 'codigo' ? 'pairing' : 'qr';
    
    // Extraer nmero de telfono del usuario
    const userPhone = usuario.split('@')[0];
    const userName = `Usuario_${userPhone}`;
    
    console.log(` Creando subbot para ${userPhone} (tipo: ${connectionType})`);
    
    const result = await createSubbot(userPhone, userName, connectionType);
    
    if (result.success) {
      let response = ` *SubBot Creado Exitosamente*\n\n`;
      response += ` *Cdigo:* ${result.subbot.code}\n`;
      response += ` *Tipo:* ${connectionType === 'qr' ? 'Cdigo QR' : 'Cdigo de Emparejamiento'}\n\n`;
      
      if (connectionType === 'qr') {
        response += ` *Instrucciones:*\n`;
        response += `1. Abre WhatsApp en tu telfono\n`;
        response += `2. Ve a Configuracin > Dispositivos Vinculados\n`;
        response += `3. Toca "Vincular un dispositivo"\n`;
        response += `4. Escanea el cdigo QR que aparecer\n\n`;
        response += ` El cdigo QR expira en 1 minuto\n`;
        response += ` Usa /missubbots para ver el estado`;
      } else {
        response += ` *Cdigo de Emparejamiento:* ${result.pairingCode}\n\n`;
        response += ` *Instrucciones:*\n`;
        response += `1. Abre WhatsApp en tu telfono\n`;
        response += `2. Ve a Configuracin > Dispositivos Vinculados\n`;
        response += `3. Toca "Vincular un dispositivo"\n`;
        response += `4. Selecciona "Vincular con nmero de telfono"\n`;
        response += `5. Ingresa el cdigo: ${result.pairingCode}\n\n`;
        response += ` Usa /missubbots para ver el estado`;
      }
      
      return {
        success: true,
        message: response,
        qr: result.qr || null
      };
    } else {
      return {
        success: false,
        message: ` Error: ${result.error}`
      };
    }
  } catch (error) {
    console.error('Error en handleSerbot:', error);
    return {
      success: false,
      message: ` *Error interno*\n\n${error.message}\n\n Contacta al administrador si el problema persiste`
    };
  }
}

/**
 * Comando /missubbots - Ver subbots del usuario
 */
export async function handleMisSubbots(usuario, grupo, fecha) {
  try {
    const userPhone = usuario.split('@')[0];
    
    const result = await getUserSubbots(userPhone);
    
    if (result.success) {
      if (result.subbots.length === 0) {
        return {
          success: true,
          message: ` *Mis SubBots*\n\n No tienes subbots creados\n\n Usa /serbot para crear uno nuevo`
        };
      }
      
      let response = ` *Mis SubBots* (${result.subbots.length})\n\n`;
      
      result.subbots.forEach((subbot, index) => {
        const statusEmoji = {
          'pending': '',
          'waiting_scan': '',
          'waiting_pairing': '',
          'connected': '',
          'disconnected': '',
          'inactive': '',
          'error': ''
        };
        
        const statusText = {
          'pending': 'Pendiente',
          'waiting_scan': 'Esperando escaneo',
          'waiting_pairing': 'Esperando emparejamiento',
          'connected': 'Conectado',
          'disconnected': 'Desconectado',
          'inactive': 'Inactivo',
          'error': 'Error'
        };
        
        response += `${index + 1}. ${statusEmoji[subbot.status] || ''} *${subbot.code}*\n`;
        response += `   Estado: ${statusText[subbot.status] || subbot.status}\n`;
        response += `   Mensajes: ${subbot.message_count}\n`;
        response += `   Creado: ${new Date(subbot.created_at).toLocaleDateString()}\n\n`;
      });
      
      response += ` *Comandos disponibles:*\n`;
      response += ` /serbot - Crear nuevo subbot\n`;
      response += ` /delsubbot <cdigo> - Eliminar subbot\n`;
      response += ` /statusbot <cdigo> - Ver estado detallado`;
      
      return {
        success: true,
        message: response
      };
    } else {
      return {
        success: false,
        message: ` *Error obteniendo subbots*\n\n${result.error}`
      };
    }
  } catch (error) {
    console.error('Error en handleMisSubbots:', error);
    return {
      success: false,
      message: ` *Error interno*\n\n${error.message}`
    };
  }
}

/**
 * Comando /delsubbot - Eliminar subbot
 */
export async function handleDelSubbot(usuario, grupo, fecha, args = []) {
  try {
    if (args.length === 0) {
      return {
        success: false,
        message: ` *Uso incorrecto*\n\nUso: /delsubbot <cdigo>\n\nEjemplo: /delsubbot sb_1234567890_abc123\n\n Usa /missubbots para ver tus cdigos`
      };
    }
    
    const subbotCode = args[0];
    const userPhone = usuario.split('@')[0];
    
    const result = await deleteSubbot(subbotCode, userPhone);
    
    if (result.success) {
      return {
        success: true,
        message: ` *SubBot Eliminado*\n\n Cdigo: ${subbotCode}\n Eliminado correctamente\n\n Usa /missubbots para ver tus subbots restantes`
      };
    } else {
      return {
        success: false,
        message: ` *Error eliminando SubBot*\n\n${result.error}\n\n Verifica el cdigo con /missubbots`
      };
    }
  } catch (error) {
    console.error('Error en handleDelSubbot:', error);
    return {
      success: false,
      message: ` *Error interno*\n\n${error.message}`
    };
  }
}

/**
 * Comando /statusbot - Ver estado detallado de un subbot
 */
export async function handleStatusBot(usuario, grupo, fecha, args = []) {
  try {
    if (args.length === 0) {
      return {
        success: false,
        message: ` *Uso incorrecto*\n\nUso: /statusbot <cdigo>\n\nEjemplo: /statusbot sb_1234567890_abc123\n\n Usa /missubbots para ver tus cdigos`
      };
    }
    
    const subbotCode = args[0];
    
    const result = await getSubbotStatus(subbotCode);
    
    if (result.success) {
      const subbot = result.subbot;
      
      const statusEmoji = {
        'pending': '',
        'waiting_scan': '',
        'waiting_pairing': '',
        'connected': '',
        'disconnected': '',
        'inactive': '',
        'error': ''
      };
      
      const statusText = {
        'pending': 'Pendiente',
        'waiting_scan': 'Esperando escaneo QR',
        'waiting_pairing': 'Esperando cdigo de emparejamiento',
        'connected': 'Conectado y funcionando',
        'disconnected': 'Desconectado',
        'inactive': 'Inactivo por falta de uso',
        'error': 'Error en la conexin'
      };
      
      let response = ` *Estado del SubBot*\n\n`;
      response += ` *Cdigo:* ${subbot.code}\n`;
      response += `${statusEmoji[subbot.status] || ''} *Estado:* ${statusText[subbot.status] || subbot.status}\n`;
      response += ` *Conectado:* ${subbot.isOnline ? 'S' : 'No'}\n`;
      response += ` *Mensajes procesados:* ${subbot.message_count}\n`;
      response += ` *Creado:* ${new Date(subbot.created_at).toLocaleString()}\n`;
      if (subbot.last_heartbeat) {
        response += ` *ltima actividad:* ${new Date(subbot.last_heartbeat).toLocaleString()}\n\n`;
      }
      
      response += ` *Acciones disponibles:*\n`;
      response += ` /delsubbot ${subbot.code} - Eliminar este subbot`;
      
      return {
        success: true,
        message: response
      };
    } else {
      return {
        success: false,
        message: ` *SubBot no encontrado*\n\n${result.error}\n\n Usa /missubbots para ver tus subbots`
      };
    }
  } catch (error) {
    console.error('Error en handleStatusBot:', error);
    return {
      success: false,
      message: ` *Error interno*\n\n${error.message}`
    };
  }
}

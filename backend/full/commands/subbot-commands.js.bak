import db from '../db.js';
import logger from '../config/logger.js';
import subbotIntegration from '../subbot-integration.js';
import { formatDistanceToNow } from 'date-fns';
import pkg from 'date-fns/locale/es/index.js';
import { generateSubbotQR, generateSubbotPairingCode } from '../multiaccount-manager.js';
const { es } = pkg;

/**
 * Muestra la ayuda de comandos de subbots
 */
async function handleHelp(sock, from, isGroup, msg) {
  const helpText = `🤖 *Comandos de SubBots* 🤖

` +
  `🔹 */subbot pair [número]* - Crea un nuevo subbot con código de emparejamiento\n` +
  `🔹 */subbot qr* - Genera un código QR para un nuevo subbot\n` +
  `🔹 */subbot list* - Muestra tus subbots\n` +
  `🔹 */subbot delete [id]* - Elimina un subbot\n` +
  `🔹 */subbot help* - Muestra esta ayuda`;

  await sock.sendMessage(from, { 
    text: helpText,
    ...(isGroup ? { mentions: [msg.sender] } : {})
  });
}

/**
 * Maneja el comando de creación de subbot con pairing code
 */
async function handlePairSubbot(sock, from, isGroup, msg, args) {
  const phoneNumber = args[0];
  
  if (!phoneNumber || phoneNumber.length < 10) {
    return await sock.sendMessage(from, { 
      text: '❌ Debes proporcionar un número de teléfono válido (mínimo 10 dígitos)\n' +
            'Ejemplo: */subbot pair 595974154768*',
      ...(isGroup ? { mentions: [msg.sender] } : {})
    });
  }

  try {
    const processingMsg = await sock.sendMessage(from, { 
      text: '⏳ Generando código de emparejamiento...',
      ...(isGroup ? { mentions: [msg.sender] } : {})
    });

    // Generar código de emparejamiento usando baileys-mod
    const result = await generateSubbotPairingCode(
      phoneNumber.replace(/[^0-9]/g, ''), // Limpiar número
      `KONMI-${Date.now().toString().slice(-4)}`
    );

    if (result.success) {
      // Guardar en la base de datos
      await db('subbots').insert({
        id: result.sessionId,
        owner_jid: msg.sender,
        phone_number: phoneNumber,
        display_name: `KONMI-${Date.now().toString().slice(-4)}`,
        type: 'pairing',
        status: 'pending',
        created_at: new Date(),
        expires_at: new Date(result.expiresAt),
        metadata: JSON.stringify({
          code: result.code,
          displayCode: result.displayCode,
          expiresAt: result.expiresAt
        })
      });

      await sock.sendMessage(from, {
        text: `✅ *CÓDIGO DE EMPAREJAMIENTO* 🔑\n\n` +
              `📱 *Número:* ${phoneNumber}\n` +
              `🔢 *Código:* ${result.code}\n\n` +
              `*Instrucciones:*\n` +
              `1. Abre WhatsApp en tu celular\n` +
              `2. Ve a Ajustes > Dispositivos vinculados\n` +
              `3. Toca "Vincular un dispositivo"\n` +
              `4. Ingresa este código: *${result.code}*\n\n` +
              `⏱️ *Expira en:* ${formatDistanceToNow(new Date(result.expiresAt), { locale: es })}`,
        ...(isGroup ? { mentions: [msg.sender] } : {})
      });
    } else {
      throw new Error(result.error || 'No se pudo generar el código de emparejamiento');
    }
  } catch (error) {
    logger.error('Error en comando pair:', error);
    await sock.sendMessage(from, { 
      text: `❌ Error al generar el código de emparejamiento: ${error.message}`,
      ...(isGroup ? { mentions: [msg.sender] } : {})
    });
  }
}

/**
 * Maneja el comando de creación de subbot con QR
 */
async function handleQRSubbot(sock, from, isGroup, msg) {
  try {
    const processingMsg = await sock.sendMessage(from, { 
      text: '⏳ Generando código QR...',
      ...(isGroup ? { mentions: [msg.sender] } : {})
    });

    // Generar código QR usando baileys-mod
    const result = await generateSubbotQR(`KONMI-QR-${Date.now().toString().slice(-4)}`);

    if (result.success) {
      // Guardar en la base de datos
      await db('subbots').insert({
        id: result.sessionId,
        owner_jid: msg.sender,
        type: 'qr',
        status: 'pending',
        created_at: new Date(),
        expires_at: new Date(result.expiresAt),
        metadata: JSON.stringify({
          qr: result.png,
          expiresAt: result.expiresAt
        })
      });

      // Enviar el código QR como imagen
      await sock.sendMessage(from, {
        image: Buffer.from(result.png, 'base64'),
        caption: `🔷 *CÓDIGO QR PARA VINCULAR SUBBOT* 🔷\n\n` +
                 `*ID del Subbot:* \`${result.sessionId}\`\n\n` +
                 `*Instrucciones:*\n` +
                 `1. Abre WhatsApp en tu celular\n` +
                 `2. Ve a Ajustes > Dispositivos vinculados\n` +
                 `3. Toca "Vincular un dispositivo"\n` +
                 `4. Escanea este código QR\n\n` +
                 `⏱️ *Expira en:* ${formatDistanceToNow(new Date(result.expiresAt), { locale: es })}`,
        ...(isGroup ? { mentions: [msg.sender] } : {})
      });
    } else {
      throw new Error(result.error || 'No se pudo generar el código QR');
    }
  } catch (error) {
    logger.error('Error en comando qr:', error);
    await sock.sendMessage(from, { 
      text: `❌ Error al generar el código QR: ${error.message}`,
      ...(isGroup ? { mentions: [msg.sender] } : {})
    });
  }
}

/**
 * Maneja el comando para listar subbots
 */
async function handleListSubbots(sock, from, isGroup, msg) {
  try {
    const subbots = await subbotIntegration.getOwnerSubbots(msg.sender);
    
    if (subbots.length === 0) {
      return await sock.sendMessage(from, {
        text: 'No tienes subbots creados. Usa */subbot pair* o */subbot qr* para crear uno.',
        ...(isGroup ? { mentions: [msg.sender] } : {})
      });
    }
    
    let message = `📱 *Tus Subbots (${subbots.length})*\n\n`;
    
    for (const [index, subbot] of subbots.entries()) {
      const metadata = typeof subbot.metadata === 'string' ? JSON.parse(subbot.metadata) : subbot.metadata || {};
      const statusEmoji = getStatusEmoji(subbot.status);
      
      message += `${index + 1}. ${statusEmoji} *${subbot.display_name || 'Sin nombre'}*\n`;
      message += `   🆔: ${subbot.id}\n`;
      
      if (subbot.phone_number) {
        message += `   📞: ${subbot.phone_number}\n`;
      }
      
      message += `   📅: ${formatDistanceToNow(new Date(subbot.created_at), { addSuffix: true, locale: es })}\n`;
      message += `   🔄: ${formatDistanceToNow(new Date(subbot.updated_at), { addSuffix: true, locale: es })}\n`;
      
      if (subbot.status === 'connected') {
        message += `   ✅ Conectado\n`;
      } else if (subbot.status === 'pending') {
        message += `   ⏳ Esperando conexión\n`;
      }
      
      message += '\n';
    }
    
    message += '\nUsa */subbot delete [id]* para eliminar un subbot';
    
    await sock.sendMessage(from, {
      text: message,
      ...(isGroup ? { mentions: [msg.sender] } : {})
    });
    
  } catch (error) {
    logger.error('Error al listar subbots:', error);
    await sock.sendMessage(from, { 
      text: '❌ Error al listar los subbots',
      ...(isGroup ? { mentions: [msg.sender] } : {})
    });
  }
}

/**
 * Maneja el comando para eliminar un subbot
 */
async function handleDeleteSubbot(sock, from, isGroup, msg, args) {
  const subbotId = args[0];
  
  if (!subbotId) {
    return await sock.sendMessage(from, { 
      text: '❌ Debes proporcionar el ID del subbot a eliminar\n' +
            'Ejemplo: */subbot delete subbot_1234567890*',
      ...(isGroup ? { mentions: [msg.sender] } : {})
    });
  }
  
  try {
    await subbotIntegration.deleteSubbot(subbotId, msg.sender);
    
    await sock.sendMessage(from, {
      text: `✅ Subbot *${subbotId}* eliminado correctamente`,
      ...(isGroup ? { mentions: [msg.sender] } : {})
    });
  } catch (error) {
    logger.error(`Error al eliminar subbot ${subbotId}:`, error);
    await sock.sendMessage(from, { 
      text: `❌ Error al eliminar el subbot: ${error.message}`,
      ...(isGroup ? { mentions: [msg.sender] } : {})
    });
  }
}

/**
 * Obtiene el emoji correspondiente al estado del subbot
 */
function getStatusEmoji(status) {
  const statusEmojis = {
    'connected': '🟢',
    'pending': '🟡',
    'error': '🔴',
    'disconnected': '⚫',
    'expired': '⏱️'
  };
  
  return statusEmojis[status] || '❓';
}

/**
 * Maneja los comandos de subbots
 */
export async function handleSubbotCommand(sock, from, isGroup, msg, args) {
  const subcommand = args[0]?.toLowerCase() || 'help';
  
  switch (subcommand) {
    case 'pair':
      await handlePairSubbot(sock, from, isGroup, msg, args.slice(1));
      break;
      
    case 'qr':
      await handleQRSubbot(sock, from, isGroup, msg);
      break;
      
    case 'list':
      await handleListSubbots(sock, from, isGroup, msg);
      break;
      
    case 'delete':
      await handleDeleteSubbot(sock, from, isGroup, msg, args.slice(1));
      break;
      
    case 'help':
    default:
      await handleHelp(sock, from, isGroup, msg);
      break;
  }
}

export default {
  name: 'subbot',
  description: 'Gestiona tus subbots',
  command: 'subbot',
  handler: handleSubbotCommand,
  help: `🤖 *Comandos de SubBots* 🤖

` +
  `🔹 */subbot pair [número]* - Crea un nuevo subbot con código de emparejamiento\n` +
  `🔹 */subbot qr* - Genera un código QR para un nuevo subbot\n` +
  `🔹 */subbot list* - Muestra tus subbots\n` +
  `🔹 */subbot delete [id]* - Elimina un subbot\n` +
  `🔹 */subbot help* - Muestra esta ayuda`
};

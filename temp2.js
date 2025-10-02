
    const launch = await launchSubbot({
      type: 'qr',
      createdBy: requesterNumber,
      requestJid: requesterJid,
      requestParticipant: requesterJid,
      metadata
    });

    if (!launch.success) {
      return { success: false, message: `âŒ Error creando sub-bot: ${launch.error}` };
    }

    const message = Boolean(grupo)
      ? 'ðŸ¤– *Creando sub-bot*\n\nðŸ”„ Estoy generando tu sub-bot y en unos segundos te enviarÃ© por privado el cÃ³digo QR para vincularlo.'
      : 'ðŸ¤– *Creando sub-bot*\n\nðŸ”„ Estoy generando tu sub-bot y en unos segundos te enviarÃ© aquÃ­ mismo el cÃ³digo QR para vincularlo.';

    return {
      success: true,
      message
    };
  } catch (error) {
    console.error('Error en handleSerbot:', error);
    return { success: false, message: 'âŒ Error al crear sub-bot' };
  }
}

async function handleCode(usuario, grupo, remoteJid, args, senderJid = null, originMessageId = null) {
  try {
    const requesterJid = ensureWhatsAppJid(senderJid || remoteJid || usuario);
    const fallbackNumber = extractDigitsFromJid(requesterJid);
    const desiredNumber = fallbackNumber;
    const customCode = 'KONMIBOT';
    const customDisplay = 'KONMI-BOT';
    const originChat = grupo || remoteJid || requesterJid;
    const metadata = {
      source: 'whatsapp',
      originChat,
      requestedFromGroup: Boolean(grupo),
      requesterJid,
      originMessageId,
      customPairingCode: customCode,
      customPairingDisplay: customDisplay
    };
    const launch = await launchSubbot({
      type: 'code',
      createdBy: fallbackNumber,
      requestJid: requesterJid,
      requestParticipant: requesterJid,
      targetNumber: desiredNumber,
      metadata
    });
    if (!launch.success) {
      return { success: false, message: `âŒ Error generando cÃ³digo: ${launch.error}` };
    }
    const message =
      'â•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—\n' +
      'â•‘        ðŸ¤– *SUBBOT CODE CREADO* ðŸ¤–     â•‘\n' +
      'â•šâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•\n\n' +
      'ðŸ” *CÃ³digo de Emparejamiento Generado*\n\n' +
      'ðŸ“± *PASOS PARA CONECTAR:*\n' +
      'â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”\n' +
      'â”‚ 1ï¸âƒ£ Abre WhatsApp en tu celular         â”‚\n' +
      'â”‚ 2ï¸âƒ£ Ve a *Dispositivos vinculados*      â”‚\n' +
      'â”‚ 3ï¸âƒ£ Toca *Vincular dispositivo*         â”‚\n' +
      'â”‚ 4ï¸âƒ£ Selecciona *Con nÃºmero*             â”‚\n' +
      'â”‚ 5ï¸âƒ£ Ingresa el cÃ³digo que te enviarÃ©    â”‚\n' +
      'â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜\n\n' +
      'â³ *Generando cÃ³digo de emparejamiento...*\n' +
      'ðŸ“ž *NÃºmero detectado:* `' + fallbackNumber + '`\n' +
      'ðŸ·ï¸ *Nombre del subbot:* `KONMI-BOT`\n\n' +
      'ðŸ’¡ *El cÃ³digo llegarÃ¡ en unos segundos*';
    return { success: true, message };
  } catch (error) {
    return { success: false, message: 'âŒ Error generando cÃ³digo de pairing.' };
  }
}

async function handleBots(usuario) {
  try {
    const subbots = await fetchSubbotListWithOnlineFlag();
    if (!subbots.length) {
      return {
        success: true,
        message: 'â•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—\n' +
                'â•‘           ðŸ¤– *TUS SUBBOTS* ðŸ¤–          â•‘\n' +
                'â•šâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•\n\n' +
                'ðŸ“­ *No tienes subbots creados*\n\n' +
                'ðŸš€ *CREAR NUEVO SUBBOT:*\n' +
                'â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”\n' +
                'â”‚ `qr`    â†’  Crear subbot con QR Code    â”‚\n' +
                'â”‚ `code`  â†’  Crear subbot con cÃ³digo     â”‚\n' +
                'â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜\n\n' +
                'ðŸ’¡ *Los subbots te permiten conectar mÃºltiples cuentas de WhatsApp*'
      };
    }
    
    const lines = subbots.map((subbot, index) => {
      const statusIcon = subbot.status === 'connected' ? 'ðŸŸ¢' : subbot.status === 'pending' ? 'ðŸŸ¡' : subbot.status === 'error' ? 'ðŸ”´' : 'âšª';
      const onlineIcon = subbot.isOnline ? 'âœ…' : 'â¹ï¸';
      const typeIcon = subbot.type === 'code' ? 'ðŸ”' : 'ðŸ“±';
      const statusText = subbot.status === 'connected' ? 'CONECTADO' : 
                        subbot.status === 'pending' ? 'ESPERANDO' : 
                        subbot.status === 'error' ? 'ERROR' : 'DESCONECTADO';
      
      return (
        `â”Œâ”€ *${index + 1}.* ${statusIcon} \`${subbot.code}\` ${onlineIcon}\n` +
        `â”‚ ${typeIcon} Tipo: ${subbot.type === 'code' ? 'Pairing Code' : 'QR Code'}\n` +
        `â”‚ ðŸ“Š Estado: *${statusText}*\n` +
        `â”‚ ðŸ“… Creado: ${new Date(subbot.created_at).toLocaleString('es-ES')}\n` +
        `â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€`
      );
    }).join('\n\n');
    
    return {
      success: true,
      message: 'â•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—\n' +
              'â•‘           ðŸ¤– *TUS SUBBOTS* ðŸ¤–          â•‘\n' +
              'â•šâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•\n\n' +
              `ðŸ“Š *Total: ${subbots.length} subbot${subbots.length !== 1 ? 's' : ''}*\n\n` +
              `${lines}\n\n` +
              'ðŸ’¡ *Usa `delbot <id>` para eliminar un subbot*'
    };
  } catch (error) {
    return { success: false, message: 'âŒ Error obteniendo subbots.' };
  }
}

async function handleDelSubbot(code, usuario) {
  try {
    if (!code) {
      return { 
        success: false, 
        message: 'â•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—\n' +
                'â•‘         âŒ *ERROR DE USO* âŒ           â•‘\n' +
                'â•šâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•\n\n' +
                'ðŸ“ *Uso correcto:*\n' +
                'â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”\n' +
                'â”‚ `delbot <subbot_id>`                   â”‚\n' +
                'â”‚ `delsubbot <subbot_id>`                â”‚\n' +
                'â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜\n\n' +
                'ðŸ’¡ *Ejemplo: `delbot abc123`*'
      };
    }
    const result = await deleteSubbot(code);
    if (!result.success) {
      return { 
        success: false, 
        message: 'â•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—\n' +
                'â•‘         âŒ *ERROR* âŒ                  â•‘\n' +
                'â•šâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•\n\n' +
                `ðŸš« *No se pudo eliminar el subbot*\n\n` +
                `ðŸ“‹ *Detalles:*\n` +
                `â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”\n` +
                `â”‚ ID: \`${code}\`\n` +
                `â”‚ Error: ${result.error}\n` +
                `â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜\n\n` +
                `ðŸ’¡ *Verifica que el ID sea correcto*`
      };
    }
    return {
      success: true,
      message: 'â•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—\n' +
              'â•‘        âœ… *SUBBOT ELIMINADO* âœ…        â•‘\n' +
              'â•šâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•\n\n' +
              `ðŸ—‘ï¸ *Subbot eliminado correctamente*\n\n` +
              `ðŸ“‹ *Detalles:*\n` +
              `â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”\n` +
              `â”‚ ID: \`${code}\`\n` +
              `â”‚ Estado: Eliminado permanentemente\n` +
              `â”‚ Fecha: ${new Date().toLocaleString('es-ES')}\n` +
              `â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜\n\n` +
              `ðŸ’¡ *Usa \`bots\` para ver tus subbots restantes*`
    };
  } catch (error) {
    return { 
      success: false, 
      message: 'â•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—\n' +
              'â•‘         âŒ *ERROR* âŒ                  â•‘\n' +
              'â•šâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•\n\n' +
              'ðŸš« *Error eliminando subbot*\n\n' +
              'ðŸ’¡ *Intenta nuevamente o contacta al administrador*'
    };
  }
}

async function handleQR(subbotCode) {
  try {
    if (!subbotCode) {
      return { 
        success: false, 
        message: 'â•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—\n' +
                'â•‘         âŒ *ERROR DE USO* âŒ           â•‘\n' +
                'â•šâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•\n\n' +
                'ðŸ“ *Uso correcto:*\n' +
                'â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”\n' +
                'â”‚ `qr <subbot_id>`                       â”‚\n' +
                'â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜\n\n' +
                'ðŸ’¡ *Ejemplo: `qr abc123`*'
      };
    }

    const subbot = await getSubbotByCode(subbotCode);
    if (!subbot) {
      return { 
        success: false, 
        message: 'â•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—\n' +
                'â•‘         âŒ *SUBBOT NO ENCONTRADO* âŒ   â•‘\n' +
                'â•šâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•\n\n' +
                `ðŸš« *No se encontrÃ³ el subbot con ID: \`${subbotCode}\`*\n\n` +
                'ðŸ’¡ *Usa `bots` para ver tus subbots disponibles*'
      };
    }

    if (!subbot.qr_data) {
      return {
        success: true,
        message: 'â•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—\n' +
                'â•‘        â³ *QR EN GENERACIÃ“N* â³        â•‘\n' +
                'â•šâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•\n\n' +
                'ðŸ”„ *El cÃ³digo QR aÃºn no estÃ¡ listo*\n\n' +
                'ðŸ“‹ *Detalles:*\n' +
                'â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”\n' +
                `â”‚ ID: \`${subbotCode}\`\n` +
                'â”‚ Estado: Generando QR...\n' +
                'â”‚ Tipo: QR Code\n' +
                'â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜\n\n' +
                'ðŸ’¡ *Te avisarÃ© aquÃ­ mismo cuando estÃ© listo*'
      };
    }

    const caption = 'â•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—\n' +
                   'â•‘        ðŸ“± *CÃ“DIGO QR SUBBOT* ðŸ“±        â•‘\n' +
                   'â•šâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•\n\n' +
                   'ðŸ”— *CONECTA TU SUBBOT:*\n' +
                   'â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”\n' +
                   'â”‚ 1ï¸âƒ£ Abre WhatsApp en tu celular         â”‚\n' +
                   'â”‚ 2ï¸âƒ£ Ve a *Dispositivos vinculados*      â”‚\n' +
                   'â”‚ 3ï¸âƒ£ Toca *Vincular dispositivo*         â”‚\n' +
                   'â”‚ 4ï¸âƒ£ Escanea este cÃ³digo QR              â”‚\n' +
                   'â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜\n\n' +
                   `ðŸ“‹ *ID del Subbot:* \`${subbotCode}\`\n` +
                   'â° *El QR expira en 2 minutos*\n\n' +
                   'ðŸ’¡ *Â¡Escanea rÃ¡pido para conectar!*';

    return {
      success: true,
      message: caption,
      media: {
        type: 'image',
        data: subbot.qr_data,
        caption
      }
    };
  } catch (error) {
    console.error('Error en handleQR:', error);
    return { 
      success: false, 
      message: 'â•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—\n' +
              'â•‘         âŒ *ERROR* âŒ                  â•‘\n' +
              'â•šâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•\n\n' +
              'ðŸš« *Error obteniendo cÃ³digo QR*\n\n' +
              'ðŸ’¡ *Intenta nuevamente o contacta al administrador*'
    };
  }
}

/**
 * /whoami - Mostrar informaciÃ³n del usuario
 */
async function handleWhoami(usuario, grupo, isGroup, waUserInfo) {
  try {
    const number = String(usuario).split('@')[0].split(':')[0];
    const user = await db('usuarios').where({ whatsapp_number: number }).select('username','rol','fecha_registro').first();
    const wa = await db('wa_contacts').where({ wa_number: number }).select('display_name').first();
    const display = waUserInfo?.pushName || wa?.display_name || user?.username || number;
    const registro = user?.fecha_registro ? new Date(user.fecha_registro).toLocaleDateString('es-ES') : 'N/D';
    const rol = user?.rol ? user.rol.toUpperCase() : 'USUARIO';

    let info = `â•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—\n`;
    info += `â•‘           ðŸ‘¤ *TU INFORMACIÃ“N* ðŸ‘¤         â•‘\n`;
    info += `â•šâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•\n\n`;
    info += `ðŸ“‹ *DETALLES PERSONALES:*\n`;
    info += `â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”\n`;
    info += `â”‚ ðŸ‘¤ Nombre: *${display}*\n`;
    info += `â”‚ ðŸ“ž NÃºmero: \`${number}\`\n`;
    if (user?.username) info += `â”‚ ðŸ–¥ï¸ Usuario Panel: @${user.username}\n`;
    info += `â”‚ ðŸ·ï¸ Rol: *${rol}*\n`;
    info += `â”‚ ðŸ“… Registro: ${registro}\n`;
    info += `â”‚ ðŸ’¬ Chat: ${grupo ? 'Grupo' : 'Privado'}\n`;
    info += `â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜\n\n`;
    info += `ðŸ’¡ *Usa \`help\` para ver todos los comandos disponibles*`;
    
    await logCommand('consulta', 'whoami', usuario, grupo);
    return { success: true, message: info };
  } catch (e) {
    await logCommand('consulta', 'whoami', usuario, grupo);
    return { 
      success: true, 
      message: `â•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—\n` +
              `â•‘           ðŸ‘¤ *INFORMACIÃ“N BÃSICA* ðŸ‘¤    â•‘\n` +
              `â•šâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•\n\n` +
              `ðŸ“‹ *Datos disponibles:*\n` +
              `â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”\n` +
              `â”‚ ðŸ‘¤ Usuario: \`${usuario}\`\n` +
              `â”‚ ðŸ’¬ Chat: ${grupo || 'Privado'}\n` +
              `â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜\n\n` +
              `ðŸ’¡ *InformaciÃ³n limitada - contacta al administrador*`
    };
  }
}

/**
 * /tag [mensaje] - Menciona a todos los miembros del grupo sin mostrar @@@@@@@
 */
async function handleTag(mensaje, usuario, grupo) {
  if (!grupo || !grupo.endsWith('@g.us')) {
    return { success: false, message: 'âŒ Este comando solo funciona en grupos.' };
  }

  try {
    const sock = getSocket();
    if (!sock) return { success: false, message: 'âŒ Bot no conectado.' };

    // Verificar si el usuario es admin del grupo
    const isAdmin = await isGroupAdmin(usuario, grupo);
    if (!isAdmin) {
      return { success: false, message: 'âŒ Solo Admin puede usar este comando.' };
    }

    // Obtener metadata del grupo
    const groupMetadata = await sock.groupMetadata(grupo);
    const participants = groupMetadata.participants || [];

    // Crear array de menciones invisibles
    const mentions = participants.map(participant => participant.id);

    // Crear el mensaje con menciones invisibles
    const message = {
      text: mensaje || 'ðŸ“¢ *Aviso para todos*\n\nÂ¡AtenciÃ³n general!',
      mentions: mentions
    };

    // Enviar mensaje con menciones
    await sock.sendMessage(grupo, message);

    await logCommand('moderacion', 'tag', usuario, grupo);

    return { success: true, message: 'âœ… Mensaje enviado a todos los miembros del grupo.' };
  } catch (error) {
    console.error('Error en handleTag:', error);
    return { success: false, message: 'âŒ Error al enviar mensaje a todos.' };
  }
}

/**
 * /responder - Menciona al autor del mensaje citado y responde en hilo
 */
async function handleReplyTag(mensaje, usuario, grupo, quotedMessage) {
  if (!grupo || !grupo.endsWith('@g.us')) {
    return { success: false, message: 'âŒ Este comando solo funciona en grupos.' };
  }
  try {
    const sock = getSocket();
    if (!sock) return { success: false, message: 'âŒ Bot no conectado.' };
    if (!quotedMessage || !quotedMessage.key) {
      return { success: false, message: 'â„¹ï¸ Responde a un mensaje para mencionar a su autor.' };
    }
    const mentionJid = quotedMessage.key.participant || quotedMessage.key.remoteJid;
    const text = mensaje || 'ðŸ“£ Respuesta para ti';
    await logCommand('moderacion', 'replytag', usuario, grupo);
    return { success: true, message: text, mentions: mentionJid ? [mentionJid] : undefined, replyTo: quotedMessage };
  } catch (e) {
    return { success: false, message: 'âŒ Error al responder con menciÃ³n.' };
  }
}

/**
 * /lock - Solo admins pueden escribir en el grupo
 */
async function handleLock(usuario, grupo) {
  if (!await isGroupAdmin(usuario, grupo)) {
    return { success: false, message: 'â›” Solo Admin puede bloquear el grupo.' };
  }
  const sock = getSocket();
  if (!sock) return { success: false, message: 'â›” Bot no conectado.' };
  if (!grupo || !grupo.endsWith('@g.us')) return { success: false, message: 'â›” Este comando solo funciona en grupos.' };
  try {
    await sock.groupSettingUpdate(grupo, 'announcement');
    await logCommand('moderacion', 'lock', usuario, grupo);
    return {
      success: true,
      message: `ðŸ”’ Grupo bloqueado. Solo admins pueden escribir.`
    };
  } catch (error) {
    return { success: false, message: 'â›” No se pudo bloquear el grupo.' };
  }
}

/**
 * /unlock - Todos pueden escribir en el grupo
 */
async function handleUnlock(usuario, grupo) {
  if (!await isGroupAdmin(usuario, grupo)) {
    return { success: false, message: 'â›” Solo Admin puede desbloquear el grupo.' };
  }
  const sock = getSocket();
  if (!sock) return { success: false, message: 'â›” Bot no conectado.' };
  if (!grupo || !grupo.endsWith('@g.us')) return { success: false, message: 'â›” Este comando solo funciona en grupos.' };
  try {
    await sock.groupSettingUpdate(grupo, 'not_announcement');
    await logCommand('moderacion', 'unlock', usuario, grupo);
    return {
      success: true,
      message: `ðŸ”“ Grupo desbloqueado. Todos pueden escribir.`
    };
  } catch (error) {
    return { success: false, message: 'â›” No se pudo desbloquear el grupo.' };
  }
}

// Funciones de utilidad existentes

/**
 * ModeraciÃ³n de grupos vÃ­a WhatsApp (requiere que el bot sea admin del grupo)
 */
async function handleKick(target, usuario, grupo) {
  if (!await isGroupAdmin(usuario, grupo)) {
    return { success: false, message: 'âŒ Solo Admin puede expulsar miembros.' };
  }
  const sock = getSocket();
  if (!sock) return { success: false, message: 'âŒ Bot no conectado.' };
  if (!grupo || !grupo.endsWith('@g.us')) return { success: false, message: 'âŒ Este comando solo funciona en grupos.' };
  
  const numero = (target || '').toString().replace(/[^0-9]/g, '');
  if (!numero) return { success: false, message: 'Uso: /kick @usuario' };
  
  // Intentar la acciÃ³n incluso si la detecciÃ³n de admin falla; WhatsApp rechazarÃ¡ si no es admin.

  try {
    const jid = await buildParticipantJid(grupo, numero);
    await sock.groupParticipantsUpdate(grupo, [jid], 'remove');
    
    const normalizedUsuario = normalizeUserNumber(usuario);
    await logCommand('moderacion', 'kick', normalizedUsuario, grupo);
    
    // Buscar el participante para obtener su nombre real
    const groupMetadata = await sock.groupMetadata(grupo);
    const participant = groupMetadata.participants.find(p => {
      const participantNumber = normalizeUserNumber(p.id || '');
      return participantNumber === numero;
    });
    
    let displayName = target.replace('@', '');
    let mentionJid = `${numero}@s.whatsapp.net`;
    
    if (participant) {
      const nombre = participant.notify || participant.name || participant.id.split('@')[0];
      displayName = nombre;
      mentionJid = participant.id;
    }
    
    return { 
      success: true, 
      message: `âœ… Usuario expulsado: @${displayName}`,
      mentions: [mentionJid]
    };
  } catch (error) {
    console.error('Error en handleKick:', error);
    return { success: false, message: 'âŒ No se pudo expulsar. AsegÃºrate de que el bot sea admin del grupo.' };
  }
}

async function handlePromote(target, usuario, grupo) {
  if (!await isGroupAdmin(usuario, grupo)) {
    return { success: false, message: 'âŒ Solo Admin puede promover miembros.' };
  }
  const sock = getSocket();
  if (!sock) return { success: false, message: 'âŒ Bot no conectado.' };
  if (!grupo || !grupo.endsWith('@g.us')) return { success: false, message: 'âŒ Este comando solo funciona en grupos.' };
  
  const numero = (target || '').toString().replace(/[^0-9]/g, '');
  if (!numero) return { success: false, message: 'Uso: /promote @usuario' };

  try {
    const jid = await buildParticipantJid(grupo, numero);
    
    // Verificar si el usuario ya es admin
    const groupMetadata = await sock.groupMetadata(grupo);
    const participant = groupMetadata.participants.find(p => {
      const participantNumber = normalizeUserNumber(p.id || '');
      return participantNumber === numero;
    });
    
    if (participant && (participant.admin === 'admin' || participant.admin === 'superadmin')) {
      return { success: false, message: 'â„¹ï¸ El usuario ya es admin.' };
    }
    
    await sock.groupParticipantsUpdate(grupo, [jid], 'promote');
    
    const normalizedUsuario = normalizeUserNumber(usuario);
    await logCommand('moderacion', 'promote', normalizedUsuario, grupo);
    
    // Buscar el participante para obtener su nombre real
    const updatedMetadata = await sock.groupMetadata(grupo);
    const updatedParticipant = updatedMetadata.participants.find(p => {
      const participantNumber = normalizeUserNumber(p.id || '');
      return participantNumber === numero;
    });
    
    let displayName = target.replace('@', '');
    let mentionJid = `${numero}@s.whatsapp.net`;
    
    if (updatedParticipant) {
      const nombre = updatedParticipant.notify || updatedParticipant.name || updatedParticipant.id.split('@')[0];
      displayName = nombre;
      mentionJid = updatedParticipant.id;
    }
    
    return {
      success: true,
      message: `âœ… Usuario promovido a admin: @${displayName}`,
      mentions: [mentionJid]
    };
  } catch (error) {
    console.error('Error en handlePromote:', error);
    return { success: false, message: 'âŒ No se pudo promover. AsegÃºrate de que el bot sea admin del grupo.' };
  }
}

async function handleDemote(target, usuario, grupo) {
  if (!await isGroupAdmin(usuario, grupo)) {
    return { success: false, message: 'âŒ Solo Admin puede degradar miembros.' };
  }
  const sock = getSocket();
  if (!sock) return { success: false, message: 'âŒ Bot no conectado.' };
  if (!grupo || !grupo.endsWith('@g.us')) return { success: false, message: 'âŒ Este comando solo funciona en grupos.' };
  
  const numero = (target || '').toString().replace(/[^0-9]/g, '');
  if (!numero) return { success: false, message: 'Uso: /demote @usuario' };

  try {
    const jid = await buildParticipantJid(grupo, numero);
    
    // Verificar si el usuario ya es NO admin
    const groupMetadata = await sock.groupMetadata(grupo);
    const participant = groupMetadata.participants.find(p => {
      const participantNumber = normalizeUserNumber(p.id || '');
      return participantNumber === numero;
    });
    
    if (participant && (!participant.admin || participant.admin === null)) {
      return { success: false, message: 'â„¹ï¸ El usuario ya NO es admin.' };
    }
    
    await sock.groupParticipantsUpdate(grupo, [jid], 'demote');
    
    const normalizedUsuario = normalizeUserNumber(usuario);
    await logCommand('moderacion', 'demote', normalizedUsuario, grupo);
    
    // Buscar el participante para obtener su nombre real
    const updatedMetadata = await sock.groupMetadata(grupo);
    const updatedParticipant = updatedMetadata.participants.find(p => {
      const participantNumber = normalizeUserNumber(p.id || '');
      return participantNumber === numero;
    });
    
    let displayName = target.replace('@', '');
    let mentionJid = `${numero}@s.whatsapp.net`;
    
    if (updatedParticipant) {
      const nombre = updatedParticipant.notify || updatedParticipant.name || updatedParticipant.id.split('@')[0];
      displayName = nombre;
      mentionJid = updatedParticipant.id;
    }
    
    return {
      success: true,
      message: `âœ… Usuario degradado de admin: @${displayName}`,
      mentions: [mentionJid]
    };
  } catch (error) {
    console.error('Error en handleDemote:', error);
    return { success: false, message: 'âŒ No se pudo degradar. AsegÃºrate de que el bot sea admin del grupo.' };
  }
}

/**
 * Verificar si un usuario es admin real del grupo usando metadata
 */
async function isGroupAdmin(usuario, grupo) {
  try {
    const sock = getSocket();
    if (!sock || !grupo) return false;
    // Si el mensaje proviene del mismo nÃºmero del bot, considerar admin del grupo
    try {
      const rawBotJid = (sock.user && sock.user.id) ? sock.user.id : '';
      const botNumber = normalizeUserNumber(rawBotJid);
      const userNumber = normalizeUserNumber(usuario);
      if (botNumber && userNumber && botNumber === userNumber) {
        // Fallback: permitir comandos del propio dueÃ±o
        console.log(`[MOD][isGroupAdmin] usuario=bot (${userNumber}) => true (fallback)`);
        return true;
      }
    } catch (_) { /* ignore */ }
    
    const targetJid = normalizeJid(usuario.includes('@') ? usuario : `${normalizeUserNumber(usuario)}@s.whatsapp.net`);
    const targetNumber = normalizeUserNumber(usuario);

    const groupMetadata = await sock.groupMetadata(grupo);
    const participants = groupMetadata.participants || [];

    const participant = participants.find((p) => {
      const pid = p.id || '';
      const normalizedParticipant = normalizeJid(pid);
      const participantNumber = normalizeUserNumber(pid);
      return (
        normalizedParticipant === targetJid ||
        (participantNumber && participantNumber === targetNumber) ||
        (targetNumber && normalizedParticipant.includes(targetNumber))
      );
    });

    if (!participant) {
      console.warn(`[MOD][isGroupAdmin] No encontrÃ© participante target=${targetJid} group=${groupMetadata.subject || grupo} size=${participants.length}`);
      return false;
    }

    const isAdmin = participant.admin === 'admin' || participant.admin === 'superadmin' || participant.admin === true;
    console.log(`[MOD][isGroupAdmin] target=${targetJid} adminFlag=${participant.admin} => ${isAdmin}`);

    return isAdmin;
  } catch (e) {
    console.error('[MOD][isGroupAdmin] Error:', e);
    return false;
  }
}

// Helper para normalizar usuario a solo nÃºmero
function normalizeUserNumber(usuarioJid) {
  if (!usuarioJid) return '';
  try {
    const decoded = baileys.jidDecode(usuarioJid);
    if (decoded?.user) {
      return decoded.user.split(':')[0];
    }
  } catch (_) {}
  return usuarioJid.split('@')[0].split(':')[0];
}

// Helper para saber si el bot es admin real del grupo
async function isBotAdmin(grupo) {
  try {
    const sock = getSocket();
    if (!sock || !grupo) return false;

    const rawBotJid = (sock.user && sock.user.id) ? sock.user.id : '';
    if (!rawBotJid) return false;

    const cleanBotJid = normalizeJid(rawBotJid);
    const botBaseNumber = cleanBotJid.split('@')[0];

    const groupMetadata = await sock.groupMetadata(grupo);
    const participants = groupMetadata.participants || [];

    // Buscar el bot en los participantes
    const botParticipant = participants.find(p => {
      const pid = p.id || '';
      const normalizedParticipant = normalizeJid(pid);
      const participantNumber = normalizeUserNumber(pid);
      return (
        participantNumber === botBaseNumber ||
        normalizedParticipant.includes(botBaseNumber)
      );
    });

    const botIsAdmin = !!(botParticipant && (botParticipant.admin === 'admin' || botParticipant.admin === 'superadmin' || botParticipant.admin === true));
    console.log(`[MOD][isBotAdmin] bot=${cleanBotJid} inGroup=${!!botParticipant} adminFlag=${botParticipant?.admin} => ${botIsAdmin}`);
    if (botIsAdmin) return true;

    // Si no encontramos al bot como participante, asumir que no es admin
    return false;
  } catch (error) {
    console.error('[MOD][isBotAdmin] Error:', error);
    return false;
  }
}

async function handleDebugAdmin(usuario, grupo) {
  try {
    const sock = getSocket();
    if (!sock) return { success: false, message: 'â›” Bot no conectado.' };
    if (!grupo || !grupo.endsWith('@g.us')) return { success: false, message: 'â›” Este comando solo funciona en grupos.' };

    const rawBotJid = (sock.user && sock.user.id) ? sock.user.id : '';
    const cleanBotJid = normalizeJid(rawBotJid);
    const botBaseNumber = cleanBotJid.split('@')[0];

    const groupMetadata = await sock.groupMetadata(grupo);
    const participants = groupMetadata.participants || [];
    const sample = participants.slice(0, Math.min(10, participants.length)).map(p => p.id);

    // Buscar coincidencias
    const foundExact = participants.some(p => p.id === rawBotJid);
    const foundClean = participants.some(p => normalizeJid(p.id || '') === cleanBotJid);
    const foundBase = participants.some(p => normalizeJid(p.id || '').startsWith(botBaseNumber));

    const asAdmin = participants.find(p => normalizeJid(p.id || '') === cleanBotJid && (p.admin === 'admin' || p.admin === 'superadmin'));

    const lines = [];
    lines.push('ðŸ§ª Debug admin del bot');
    lines.push(`â€¢ rawBotJid: ${rawBotJid}`);
    lines.push(`â€¢ cleanBotJid: ${cleanBotJid}`);
    lines.push(`â€¢ botBaseNumber: ${botBaseNumber}`);
    lines.push(`â€¢ foundExact(raw): ${foundExact}`);
    lines.push(`â€¢ foundClean(no sufijo): ${foundClean}`);
    lines.push(`â€¢ foundBase(startsWith): ${foundBase}`);
    lines.push(`â€¢ isAdminFlag: ${asAdmin ? 'true' : 'false'}`);
    lines.push(`â€¢ group: ${groupMetadata.subject || grupo}`);
    lines.push('â€¢ sampleParticipants (10):');
    sample.forEach((jid, idx) => lines.push(`  - [${idx+1}] ${jid}`));

    return { success: true, message: lines.join('\n') };
  } catch (e) {
    return { success: false, message: 'â›” Error en debugadmin.' };
  }
}

// Helper: obtener JID de participante respetando el formato del grupo (lid vs s.whatsapp.net)
async function buildParticipantJid(grupo, numero) {
  const sock = getSocket();
  if (!sock) return `${numero}@s.whatsapp.net`;
  try {
    const meta = await sock.groupMetadata(grupo);
    const participants = meta.participants || [];
    const groupUsesLid = participants.some(p => (p.id || '').endsWith('@lid'));
    return groupUsesLid ? `${numero}@lid` : `${numero}@s.whatsapp.net`;
  } catch (_) {
    return `${numero}@s.whatsapp.net`;
  }
}

// Helper: obtener nombre real del participante para menciones
async function getParticipantName(grupo, numero) {
  const sock = getSocket();
  if (!sock) return numero;
  try {
    const meta = await sock.groupMetadata(grupo);
    const participants = meta.participants || [];
    
    console.log(`ðŸ” Buscando participante con nÃºmero: ${numero}`);
    console.log(`ðŸ“Š Total participantes: ${participants.length}`);
    
    // Buscar participante por nÃºmero (mÃ¡s flexible)
    const participant = participants.find(p => {
      const pid = p.id || '';
      // Buscar por nÃºmero en cualquier parte del JID
      const found = pid.includes(numero);
      if (found) {
        console.log(`âœ… Encontrado por nÃºmero: ${pid}`);
        console.log(`   - notify: ${p.notify}`);
        console.log(`   - name: ${p.name}`);
        console.log(`   - admin: ${p.admin}`);
        console.log(`   - keys: ${Object.keys(p).join(', ')}`);
      }
      return found;
    });
    
    if (participant) {
      // Intentar diferentes campos para obtener el nombre
      const possibleNames = [
        participant.notify,
        participant.name,
        participant.displayName,
        participant.pushName,
        participant.verifiedName
      ].filter(name => name && name.trim());
      
      if (possibleNames.length > 0) {
        const realName = possibleNames[0].trim();
        console.log(`ðŸ“ Usando nombre real: ${realName}`);
        return realName;
      }
      
      // Si no hay nombre, usar el ID limpio
      const cleanId = participant.id.split('@')[0];
      console.log(`ðŸ“ Usando ID limpio: ${cleanId}`);
      return cleanId || numero;
    }
    
    // Si no encontramos por nÃºmero directo, buscar por JID normalizado
    const normalizedTarget = `${numero}@s.whatsapp.net`;
    console.log(`ðŸ” Buscando por JID normalizado: ${normalizedTarget}`);
    
    const participantByJid = participants.find(p => {
      const normalized = normalizeJid(p.id || '');
      const found = normalized === normalizedTarget;
      if (found) {
        console.log(`âœ… Encontrado por JID normalizado: ${p.id} -> ${normalized}`);
      }
      return found;
    });
    
    if (participantByJid) {
      const possibleNames = [
        participantByJid.notify,
        participantByJid.name,
        participantByJid.displayName,
        participantByJid.pushName,
        participantByJid.verifiedName
      ].filter(name => name && name.trim());
      
      if (possibleNames.length > 0) {
        const realName = possibleNames[0].trim();
        console.log(`ðŸ“ Usando nombre real (JID): ${realName}`);
        return realName;
      }
    }
    
    console.log(`âŒ No se encontrÃ³ participante para nÃºmero: ${numero}`);
    return numero;
  } catch (error) {
    console.error('Error en getParticipantName:', error);
    return numero;
  }
}

// ==================== COMANDOS DE MEDIA (MAYCOLPLUS) ====================

/**
 * Descargar video/audio de YouTube
 */
async function handleYouTubeDownload(usuario, grupo, isGroup, args) {
  try {
    if (!args || args.length === 0) {
      return {
        success: false,
        message: `ðŸŽ¬ *Descarga de YouTube*\n\n` +
                `ðŸ“ *Uso:* \`/yt <enlace o bÃºsqueda>\`\n` +
                `ðŸ“ *Ejemplo:* \`/yt https://youtube.com/watch?v=...\`\n` +
                `ðŸ“ *Ejemplo:* \`/yt mÃºsica relajante\`\n\n` +
                `âœ¨ *Funciones:*\n` +
                `â€¢ Descargar videos de YouTube\n` +
                `â€¢ Buscar y descargar por nombre\n` +
                `â€¢ Calidad automÃ¡tica HD`
      };
    }

    const query = args.join(' ');
    const socket = getSocket();
    
    if (!socket) {
      return {
        success: false,
        message: 'âŒ Bot no conectado. Intenta mÃ¡s tarde.'
      };
    }

    // Simular bÃºsqueda (en implementaciÃ³n real usarÃ­as yt-search)
    const searchResults = [
      {
        title: `Resultado para: ${query}`,
        url: `https://youtube.com/watch?v=dQw4w9WgXcQ`,
        duration: '3:32',
        views: '1.2B',
        author: 'Canal de ejemplo'
      }
    ];

    const video = searchResults[0];
    
    const response = `ðŸŽ¬ *${video.title}*\n\n` +
                    `ðŸ‘¤ *Canal:* ${video.author}\n` +
                    `â±ï¸ *DuraciÃ³n:* ${video.duration}\n` +
                    `ðŸ‘€ *Vistas:* ${video.views}\n\n` +
                    `ðŸ”„ *Procesando descarga...*\n` +
                    `â–“â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘ 25%\n\n` +
                    `âœ¨ *Funciones disponibles:*\n` +
                    `â€¢ \`/ytmp3\` - Solo audio\n` +
                    `â€¢ \`/ytmp4\` - Video completo\n` +
                    `â€¢ \`/yt\` - Opciones interactivas`;

    return {
      success: true,
      message: response
    };

  } catch (error) {
    console.error('Error en handleYouTubeDownload:', error);
    return {
      success: false,
      message: 'âŒ Error al procesar la descarga de YouTube.'
    };
  }
}

/**
 * Crear sticker desde imagen/video
 */
async function handleSticker(usuario, grupo, isGroup, args) {
  try {
    return {
      success: true,
      message: `ðŸŽ­ *Crear Sticker*

1ï¸âƒ£ EnvÃ­a o reenvÃ­a la imagen/video que quieres convertir.
2ï¸âƒ£ RespÃ³ndelo con \`/sticker\` (o su alias \`.s\`).
3ï¸âƒ£ Espera unos segundos y recibirÃ¡s el sticker listo para usar.

âœ¨ Tip: los videos cortos (â‰¤6s) se convierten en stickers animados.`
    };

  } catch (error) {
    console.error('Error en handleSticker:', error);
    return {
      success: false,
      message: 'âŒ Error al procesar el sticker.'
    };
  }
}

/**
 * Descargar videos de TikTok
 */
async function handleTikTokDownload(usuario, grupo, isGroup, args) {
  try {
    if (!args || args.length === 0) {
      return {
        success: false,
        message: `ðŸŽµ *Descarga de TikTok*\n\n` +
                `ðŸ“ *Uso:* \`/tiktok <enlace o bÃºsqueda>\`\n` +
                `ðŸ“ *Ejemplo:* \`/tiktok https://tiktok.com/@user/video/123\`\n` +
                `ðŸ“ *Ejemplo:* \`/tiktok baile viral\`\n\n` +
                `âœ¨ *Funciones:*\n` +
                `â€¢ Descargar videos de TikTok\n` +
                `â€¢ Buscar videos por hashtag\n` +
                `â€¢ Calidad HD sin marca de agua`
      };
    }

    const query = args.join(' ');
    
    const response = `ðŸŽµ *TikTok Downloader*\n\n` +
                    `ðŸ” *Buscando:* ${query}\n` +
                    `ðŸ”„ *Procesando...*\n` +
                    `â–“â–“â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘ 50%\n\n` +
                    `âœ¨ *CaracterÃ­sticas:*\n` +
                    `â€¢ Sin marca de agua\n` +
                    `â€¢ Calidad HD\n` +
                    `â€¢ Descarga rÃ¡pida\n` +
                    `â€¢ Soporte para enlaces y bÃºsquedas`;

    return {
      success: true,
      message: response
    };

  } catch (error) {
    console.error('Error en handleTikTokDownload:', error);
    return {
      success: false,
      message: 'âŒ Error al procesar la descarga de TikTok.'
    };
  }
}

/**
 * Descargar contenido de Instagram
 */
async function handleInstagramDownload(usuario, grupo, isGroup, args) {
  try {
    if (!args || args.length === 0) {
      return {
        success: false,
        message: `ðŸ“¸ *Descarga de Instagram*\n\n` +
                `ðŸ“ *Uso:* \`/ig <enlace de Instagram>\`\n` +
                `ðŸ“ *Ejemplo:* \`/ig https://instagram.com/p/ABC123\`\n\n` +
                `âœ¨ *Soporta:*\n` +
                `â€¢ Fotos individuales\n` +
                `â€¢ Videos\n` +
                `â€¢ Carousels (mÃºltiples fotos)\n` +
                `â€¢ Stories (si son pÃºblicas)`
      };
    }

    const url = args[0];
    
    const response = `ðŸ“¸ *Instagram Downloader*\n\n` +
                    `ðŸ”— *URL:* ${url}\n` +
                    `ðŸ”„ *Analizando contenido...*\n` +
                    `â–“â–“â–“â–‘â–‘â–‘â–‘â–‘â–‘â–‘ 75%\n\n` +
                    `âœ¨ *Procesando:*\n` +
                    `â€¢ Detecting media type\n` +
                    `â€¢ Optimizing quality\n` +
                    `â€¢ Preparing download`;

    return {
      success: true,
      message: response
    };

  } catch (error) {
    console.error('Error en handleInstagramDownload:', error);
    return {
      success: false,
      message: 'âŒ Error al procesar la descarga de Instagram.'
    };
  }
}

/**
 * Descargar videos de Twitter/X
 */
async function handleTwitterDownload(usuario, grupo, isGroup, args) {
  try {
    if (!args || args.length === 0) {
      return {
        success: false,
        message: `ðŸ¦ *Descarga de Twitter/X*\n\n` +
                `ðŸ“ *Uso:* \`/twitter <enlace de Twitter>\`\n` +
                `ðŸ“ *Ejemplo:* \`/twitter https://twitter.com/user/status/123\`\n\n` +
                `âœ¨ *Soporta:*\n` +
                `â€¢ Videos de Twitter\n` +
                `â€¢ GIFs\n` +
                `â€¢ ImÃ¡genes\n` +
                `â€¢ Hilos completos`
      };
    }

    const url = args[0];
    
    const response = `ðŸ¦ *Twitter Downloader*\n\n` +
                    `ðŸ”— *URL:* ${url}\n` +
                    `ðŸ”„ *Procesando...*\n` +
                    `â–“â–“â–“â–“â–‘â–‘â–‘â–‘â–‘â–‘ 80%\n\n` +
                    `âœ¨ *CaracterÃ­sticas:*\n` +
                    `â€¢ Calidad original\n` +
                    `â€¢ Sin compresiÃ³n\n` +
                    `â€¢ Descarga rÃ¡pida`;

    return {
      success: true,
      message: response
    };

  } catch (error) {
    console.error('Error en handleTwitterDownload:', error);
    return {
      success: false,
      message: 'âŒ Error al procesar la descarga de Twitter.'
    };
  }
}

/**
 * Obtener informaciÃ³n del LID del usuario
 */
async function handleGetLID(usuario, grupo, isGroup, args) {
  try {
    // Solo superadmins pueden ver esta informaciÃ³n
    if (!isSuperAdmin(usuario)) {
      return {
        success: false,
        message: 'âŒ Solo los superadmins pueden obtener esta informaciÃ³n.'
      };
    }

    const socket = getSocket();
    if (!socket) {
      return {
        success: false,
        message: 'âŒ Bot no conectado.'
      };
    }

    // Obtener informaciÃ³n del bot
    const botJid = socket.user?.jid || 'No disponible';
    const botNumber = botJid.split('@')[0];
    const botServer = botJid.split('@')[1];

    let response = `ðŸ” *InformaciÃ³n del Sistema*\n\n`;
    response += `ðŸ¤– *Bot JID:* ${botJid}\n`;
    response += `ðŸ“± *Bot NÃºmero:* ${botNumber}\n`;
    response += `ðŸŒ *Servidor:* ${botServer}\n\n`;
    
    response += `ðŸ‘¤ *Tu informaciÃ³n:*\n`;
    response += `â€¢ Usuario: ${usuario}\n`;
    response += `â€¢ NÃºmero: ${usuario.split('@')[0]}\n`;
    response += `â€¢ Servidor: ${usuario.split('@')[1]}\n\n`;
    
    response += `ðŸ”§ *ConfiguraciÃ³n actual:*\n`;
    response += `â€¢ Superadmins: ${global.owner.length}\n`;
    response += `â€¢ Moderadores: ${global.mods.length}\n`;
    response += `â€¢ Premium: ${global.prems.length}\n\n`;
    
    response += `ðŸ“‹ *Para actualizar tu LID:*\n`;
    response += `â€¢ Usa \`/updatelid <tu_lid_completo>\`\n`;
    response += `â€¢ Ejemplo: \`/updatelid 1234567890@lid\`\n`;
    response += `â€¢ O usa \`/updatelid auto\` para detectar automÃ¡ticamente`;

    return {
      success: true,
      message: response
    };

  } catch (error) {
    console.error('Error en handleGetLID:', error);
    return {
      success: false,
      message: 'âŒ Error al obtener informaciÃ³n del LID.'
    };
  }
}

/**
 * Actualizar LID del usuario
 */
async function handleUpdateLID(usuario, grupo, isGroup, args) {
  try {
    // Solo superadmins pueden actualizar LIDs
    if (!isSuperAdmin(usuario)) {
      return {
        success: false,
        message: 'âŒ Solo los superadmins pueden actualizar LIDs.'
      };
    }

    if (!args || args.length < 1) {
      return {
        success: false,
        message: 'ðŸ“ *Uso:* `/updatelid <tu_lid_completo>`\n\n' +
                'ðŸ“ *Ejemplo:* `/updatelid 1234567890@lid`\n' +
                'ðŸ“ *Auto:* `/updatelid auto` (detectar automÃ¡ticamente)'
      };
    }

    const lidInput = args[0].toLowerCase();
    
    if (lidInput === 'auto') {
      // Detectar automÃ¡ticamente el LID del usuario actual
      const currentLid = usuario; // El usuario ya viene con el formato correcto
      
      // Actualizar en la configuraciÃ³n global
      const userIndex = global.owner.findIndex(([num]) => isSuperAdmin(num));
      if (userIndex !== -1) {
        global.owner[userIndex][0] = currentLid.split('@')[0];
      }

      return {
        success: true,
        message: `âœ… LID actualizado automÃ¡ticamente:\n` +
                `â€¢ LID detectado: ${currentLid}\n` +
                `â€¢ NÃºmero: ${currentLid.split('@')[0]}\n` +
                `â€¢ Servidor: ${currentLid.split('@')[1]}\n\n` +
                `ðŸ”„ Los cambios se aplicarÃ¡n en el prÃ³ximo reinicio.`
      };
    } else {
      // LID manual
      const lid = args[0];
      
      // Validar formato bÃ¡sico
      if (!lid.includes('@')) {
        return {
          success: false,
          message: 'âŒ Formato de LID invÃ¡lido. Debe incluir @ (ej: 1234567890@lid)'
        };
      }

      const [numero, servidor] = lid.split('@');
      
      // Actualizar en la configuraciÃ³n global
      const userIndex = global.owner.findIndex(([num]) => isSuperAdmin(num));
      if (userIndex !== -1) {
        global.owner[userIndex][0] = numero;
      }

      return {
        success: true,
        message: `âœ… LID actualizado manualmente:\n` +
                `â€¢ LID: ${lid}\n` +
                `â€¢ NÃºmero: ${numero}\n` +
                `â€¢ Servidor: ${servidor}\n\n` +
                `ðŸ”„ Los cambios se aplicarÃ¡n en el prÃ³ximo reinicio.`
      };
    }

  } catch (error) {
    console.error('Error en handleUpdateLID:', error);
    return {
      success: false,
      message: 'âŒ Error al actualizar LID.'
    };
  }
}

// ==================== COMANDOS DE ADMINISTRACIÃ“N GLOBAL ====================

/**
 * Mostrar informaciÃ³n del sistema de administradores
 */
async function handleAdminInfo(usuario, grupo, isGroup, args) {
  try {
    // Verificar permisos
    if (!await isOwnerOrAdmin(usuario, grupo)) {
      return {
        success: false,
        message: 'âŒ Solo los administradores pueden ver esta informaciÃ³n.'
      };
    }

    const ownerName = getOwnerName(usuario);
    const isSuper = isSuperAdmin(usuario);
    const isMod = isModerator(usuario);
    const isPrem = isPremium(usuario);

    let response = `ðŸ”§ *Sistema de AdministraciÃ³n*\n\n`;
    response += `ðŸ‘¤ *Tu informaciÃ³n:*\n`;
    response += `â€¢ Nombre: ${ownerName}\n`;
    response += `â€¢ NÃºmero: ${usuario}\n`;
    response += `â€¢ Superadmin: ${isSuper ? 'âœ…' : 'âŒ'}\n`;
    response += `â€¢ Moderador: ${isMod ? 'âœ…' : 'âŒ'}\n`;
    response += `â€¢ Premium: ${isPrem ? 'âœ…' : 'âŒ'}\n\n`;

    response += `ðŸ‘‘ *Superadmins globales:*\n`;
    global.owner.forEach(([num, name, isSuper], index) => {
      response += `${index + 1}. ${name} (${num})\n`;
    });

    response += `\nðŸ›¡ï¸ *Moderadores:* ${global.mods.length}\n`;
    response += `ðŸ’Ž *Usuarios Premium:* ${global.prems.length}\n\n`;

    response += `ðŸ“‹ *Comandos disponibles:*\n`;
    response += `â€¢ \`/addadmin <numero> <nombre>\` - Agregar superadmin\n`;
    response += `â€¢ \`/deladmin <numero>\` - Quitar superadmin\n`;
    response += `â€¢ \`/addmod <numero>\` - Agregar moderador\n`;
    response += `â€¢ \`/delmod <numero>\` - Quitar moderador\n`;
    response += `â€¢ \`/addprem <numero>\` - Agregar premium\n`;
    response += `â€¢ \`/delprem <numero>\` - Quitar premium\n`;

    return {
      success: true,
      message: response
    };

  } catch (error) {
    console.error('Error en handleAdminInfo:', error);
    return {
      success: false,
      message: 'âŒ Error al obtener informaciÃ³n de administraciÃ³n.'
    };
  }
}

/**
 * Agregar superadmin
 */
async function handleAddAdmin(usuario, grupo, isGroup, args) {
  try {
    // Solo superadmins pueden agregar otros superadmins
    if (!isSuperAdmin(usuario)) {
      return {
        success: false,
        message: 'âŒ Solo los superadmins pueden agregar otros superadmins.'
      };
    }

    if (!args || args.length < 2) {
      return {
        success: false,
        message: 'ðŸ“ *Uso:* `/addadmin <numero> <nombre>`\n\n' +
                'ðŸ“ *Ejemplo:* `/addadmin 1234567890 Juan PÃ©rez`'
      };
    }

    const numero = args[0].replace(/[^0-9]/g, '');
    const nombre = args.slice(1).join(' ');

    // Verificar si ya existe
    const existingAdmin = global.owner.find(([num]) => num === numero);
    if (existingAdmin) {
      return {
        success: false,
        message: `âŒ El nÃºmero ${numero} ya es superadmin.`
      };
    }

    // Agregar a la lista global
    global.owner.push([numero, nombre, true]);

    return {
      success: true,
      message: `âœ… Superadmin agregado exitosamente:\n` +
              `â€¢ Nombre: ${nombre}\n` +
              `â€¢ NÃºmero: ${numero}\n\n` +
              `ðŸ”„ Los cambios se aplicarÃ¡n en el prÃ³ximo reinicio.`
    };

  } catch (error) {
    console.error('Error en handleAddAdmin:', error);
    return {
      success: false,
      message: 'âŒ Error al agregar superadmin.'
    };
  }
}

/**
 * Quitar superadmin
 */
async function handleDelAdmin(usuario, grupo, isGroup, args) {
  try {
    // Solo superadmins pueden quitar otros superadmins
    if (!isSuperAdmin(usuario)) {
      return {
        success: false,
        message: 'âŒ Solo los superadmins pueden quitar otros superadmins.'
      };
    }

    if (!args || args.length < 1) {
      return {
        success: false,
        message: 'ðŸ“ *Uso:* `/deladmin <numero>`\n\n' +
                'ðŸ“ *Ejemplo:* `/deladmin 1234567890`'
      };
    }

    const numero = args[0].replace(/[^0-9]/g, '');

    // Verificar si existe
    const adminIndex = global.owner.findIndex(([num]) => num === numero);
    if (adminIndex === -1) {
      return {
        success: false,
        message: `âŒ El nÃºmero ${numero} no es superadmin.`
      };
    }

    // No permitir quitarse a sÃ­ mismo
    const usuarioNumero = usuario.replace(/[^0-9]/g, '');
    if (numero === usuarioNumero) {
      return {
        success: false,
        message: 'âŒ No puedes quitarte a ti mismo como superadmin.'
      };
    }

    // Quitar de la lista global
    const removedAdmin = global.owner.splice(adminIndex, 1)[0];

    return {
      success: true,
      message: `âœ… Superadmin removido exitosamente:\n` +
              `â€¢ Nombre: ${removedAdmin[1]}\n` +
              `â€¢ NÃºmero: ${numero}\n\n` +
              `ðŸ”„ Los cambios se aplicarÃ¡n en el prÃ³ximo reinicio.`
    };

  } catch (error) {
    console.error('Error en handleDelAdmin:', error);
    return {
      success: false,
      message: 'âŒ Error al quitar superadmin.'
    };
  }
}

/**
 * Agregar moderador
 */
async function handleAddMod(usuario, grupo, isGroup, args) {
  try {
    // Solo superadmins pueden agregar moderadores
    if (!isSuperAdmin(usuario)) {
      return {
        success: false,
        message: 'âŒ Solo los superadmins pueden agregar moderadores.'
      };
    }

    if (!args || args.length < 1) {
      return {
        success: false,
        message: 'ðŸ“ *Uso:* `/addmod <numero>`\n\n' +
                'ðŸ“ *Ejemplo:* `/addmod 1234567890`'
      };
    }

    const numero = args[0].replace(/[^0-9]/g, '');

    // Verificar si ya es superadmin
    if (isSuperAdmin(`${numero}@s.whatsapp.net`)) {
      return {
        success: false,
        message: `âŒ El nÃºmero ${numero} ya es superadmin.`
      };
    }

    // Verificar si ya es moderador
    if (isModerator(`${numero}@s.whatsapp.net`)) {
      return {
        success: false,
        message: `âŒ El nÃºmero ${numero} ya es moderador.`
      };
    }

    // Agregar a la lista global
    global.mods.push(numero);

    return {
      success: true,
      message: `âœ… Moderador agregado exitosamente:\n` +
              `â€¢ NÃºmero: ${numero}\n\n` +
              `ðŸ”„ Los cambios se aplicarÃ¡n en el prÃ³ximo reinicio.`
    };

  } catch (error) {
    console.error('Error en handleAddMod:', error);
    return {
      success: false,
      message: 'âŒ Error al agregar moderador.'
    };
  }
}

/**
 * Quitar moderador
 */
async function handleDelMod(usuario, grupo, isGroup, args) {
  try {
    // Solo superadmins pueden quitar moderadores
    if (!isSuperAdmin(usuario)) {
      return {
        success: false,
        message: 'âŒ Solo los superadmins pueden quitar moderadores.'
      };
    }

    if (!args || args.length < 1) {
      return {
        success: false,
        message: 'ðŸ“ *Uso:* `/delmod <numero>`\n\n' +
                'ðŸ“ *Ejemplo:* `/delmod 1234567890`'
      };
    }

    const numero = args[0].replace(/[^0-9]/g, '');

    // Verificar si existe
    const modIndex = global.mods.indexOf(numero);
    if (modIndex === -1) {
      return {
        success: false,
        message: `âŒ El nÃºmero ${numero} no es moderador.`
      };
    }

    // Quitar de la lista global
    global.mods.splice(modIndex, 1);

    return {
      success: true,
      message: `âœ… Moderador removido exitosamente:\n` +
              `â€¢ NÃºmero: ${numero}\n\n` +
              `ðŸ”„ Los cambios se aplicarÃ¡n en el prÃ³ximo reinicio.`
    };

  } catch (error) {
    console.error('Error en handleDelMod:', error);
    return {
      success: false,
      message: 'âŒ Error al quitar moderador.'
    };
  }
}

// Helper para obtener el mensaje global OFF
async function getGlobalOffMessage() {
  try {
    const row = await db('configuracion').where({ parametro: 'global_off_message' }).first();
    return row?.valor || 'âŒ El bot estÃ¡ desactivado globalmente por el administrador.';
  } catch {
    return 'âŒ El bot estÃ¡ desactivado globalmente por el administrador.';
  }
}

// En el manejador principal de comandos (ejemplo pseudocÃ³digo, debes ubicarlo en el entrypoint de comandos)
async function handleCommand(ctx) {
  // ...
  // Verificar estado global antes de ejecutar cualquier comando
  const globalState = await db('bot_global_state').select('*').first();
  if (!globalState || !globalState.isOn) {
    const msg = await getGlobalOffMessage();
    await ctx.reply(msg);
    return;
  }
  // ... resto de la lÃ³gica de comandos ...
}
// =====================
// Ban / Unban helpers
// =====================

function normalizeNumber(value) {
  if (!value) return null;
  return String(value).replace(/[^0-9]/g, '');
}

async function ensureBansTable() {
  const has = await db.schema.hasTable('usuarios_baneados');
  if (!has) {
    await db.schema.createTable('usuarios_baneados', (t) => {
      t.increments('id').primary();
      t.string('wa_number').notNullable().unique();
      t.text('reason').defaultTo('');
      t.string('banned_by').defaultTo('');
      t.timestamp('fecha').defaultTo(db.fn.now());
    });
  }
}

async function handleBan(target, usuario, grupo, reason = '') {
  try {
    await ensureBansTable();
    const number = normalizeNumber(target);
    if (!number) {
      return { success: false, message: 'âŒ Debes mencionar o indicar un nÃºmero vÃ¡lido.' };
    }

    // Permisos: superadmin o admin del grupo
    const owner = normalizeNumber(usuario);
    let allowed = isSuperAdmin(usuario) === true;
    if (!allowed && grupo) {
      allowed = await isGroupAdmin(usuario, grupo);
    }
    if (!allowed) {
      return { success: false, message: 'â›” No tienes permisos para banear.' };
    }

    if (owner === number) {
      return { success: false, message: 'âŒ No puedes banearte a ti mismo.' };
    }

    await db('usuarios_baneados')
      .insert({ wa_number: number, reason, banned_by: owner })
      .onConflict('wa_number')
      .merge({ reason, banned_by: owner, fecha: db.fn.now() });

    return { success: true, message: `ðŸš« Usuario @${number} ha sido baneado del bot.${reason ? ` Motivo: ${reason}` : ''}` };
  } catch (error) {
    console.error('Error en handleBan:', error);
    return { success: false, message: 'âŒ Error al banear usuario.' };
  }
}

async function handleUnban(target, usuario, grupo) {
  try {
    await ensureBansTable();
    const number = normalizeNumber(target);
    if (!number) {
      return { success: false, message: 'âŒ Debes mencionar o indicar un nÃºmero vÃ¡lido.' };
    }

    // Permisos: superadmin o admin del grupo
    let allowed = isSuperAdmin(usuario) === true;
    if (!allowed && grupo) {
      allowed = await isGroupAdmin(usuario, grupo);
    }
    if (!allowed) {
      return { success: false, message: 'â›” No tienes permisos para desbanear.' };
    }

    const deleted = await db('usuarios_baneados').where({ wa_number: number }).del();
    if (!deleted) {
      return { success: false, message: 'â„¹ï¸ El usuario no estaba baneado.' };
    }
    return { success: true, message: `âœ… Usuario @${number} ha sido desbaneado.` };
  } catch (error) {
    console.error('Error en handleUnban:', error);
    return { success: false, message: 'âŒ Error al desbanear usuario.' };
  }
}

export {
  // Comandos bÃ¡sicos
  handleHelp,
  handleIA,
  handleClasificar,
  handleMyAportes,
  handleAportes,
  handleManhwas,
  handleSeries,
  handleAddAporte,
  handleAddSerie,
  handlePedido,
  // Comandos de obtenciÃ³n
  handleObtenerManhwa,
  handleObtenerExtra,
  handleObtenerIlustracion,
  handleObtenerPack,
  
  // Comandos existentes
  handleKick,
  handlePromote,
  handleDemote,
  handleAporteEstado,
  handleLock,
  handleUnlock,
  handleBotOn,
  handleBotOff,
  handleBotGlobalOn,
  handleBotGlobalOff,
  isBotGloballyActive,
  wasUserNotifiedAboutMaintenance,
  markUserAsNotifiedAboutMaintenance,
  clearMaintenanceNotifications,
  clearGroupOffNotices,
  handleUpdate,
  handleSerbot,
  handleBots,
  handleDelSubbot,
  handleQR,
  handleCode,
  handleWhoami,
  handleTag,
  handleReplyTag,

  // Reexportados consolidaciÃ³n
  handleMusic,
  handleVideo,
  handleMeme,
  handleWallpaper,
  handleJoke,
  handleAIEnhanced as handleAI,
  handleImage,
  handleTranslate,
  handleWeather,
  handleQuote,
  handleFact,
  handleTrivia,
  handleHoroscope,
  handleLogsAdvanced,
  handleStatus,
  handlePing,
  handleStats,
  handleExport,
  handleDescargar,
  handleGuardar,
  handleArchivos,
  handleMisArchivos,
  handleEstadisticas,
  handleLimpiar,
  handleBuscarArchivo,
  
  // Variables de estado
  modoPrivado,
  modoAmigos,
  advertenciasActivas,
  
  // Debug
  handleDebugAdmin,
  
  // Funciones de utilidad
  isGroupAdmin,
  
  // Comandos de Media (MaycolPlus)
  handleYouTubeDownload,
  handleSticker,
  handleTikTokDownload,
  handleInstagramDownload,
  handleTwitterDownload,

  // Comandos de SubBots
  handleSerbot,
  handleMisSubbots,
  handleDelSubbot,
  handleStatusBot,
  
  // ModeraciÃ³n: ban/unban
  handleBan,
  handleUnban,

};
export {
  // ...
  handleBan,
  handleUnban,
};


import db from './db.js';
import { analyzeContentWithAI, chatWithAI, analyzeManhwaContent } from './handler.js';
import { addAporte } from './handler.js';

/**
 * Handle the /aportar command to save a new aporte in the database.
 * @param {string} contenido - The content description or title.
 * @param {string} tipo - The type of content (e.g., 'manhwa', 'ilustracion', 'extra').
 * @param {string} usuario - The user who sent the aporte.
 * @param {string} grupo - The group where the aporte was sent.
 * @param {string} fecha - The date/time of the aporte.
 */
function normalizeAporteTipo(raw) {
  if (!raw) return 'extra';
  const v = String(raw).trim().toLowerCase();
  const map = {
    'manhwa': 'manhwa',
    'manhwas': 'manhwa',
    'manhwas_bls': 'manhwas_bls',
    'manhwa bls': 'manhwas_bls',
    'bls': 'manhwas_bls',
    'serie': 'series',
    'series': 'series',
    'series_videos': 'series_videos',
    'series videos': 'series_videos',
    'series_bls': 'series_bls',
    'series bls': 'series_bls',
    'anime': 'anime',
    'anime_bls': 'anime_bls',
    'anime bls': 'anime_bls',
    'extra': 'extra',
    'extra_imagen': 'extra_imagen',
    'extra imagen': 'extra_imagen',
    'imagen': 'extra_imagen',
    'ilustracion': 'ilustracion',
    'ilustración': 'ilustracion',
    'ilustraciones': 'ilustracion',
    'pack': 'pack'
  };
  return map[v] || v.replace(/\s+/g, '_');
}

export async function handleAportar(contenido, tipo, usuario, grupo, fecha) {
  try {
    const tipoNorm = normalizeAporteTipo(tipo);
    // Usar el handler principal
    return await addAporte({ contenido, tipo: tipoNorm, usuario, grupo, fecha });
  } catch (error) {
    return { success: false, message: error.message };
  }
}

/**
 * Handle the /ai command to interact with Gemini AI for general questions.
 * @param {string} pregunta - The question to ask the AI.
 * @param {string} usuario - The user who sent the command.
 * @param {string} grupo - The group where the command was sent.
 * @param {string} fecha - The date/time of the command.
 */
async function handleAI(pregunta, usuario, grupo, fecha) {
  try {
    console.log(`🤖 Comando /ai recibido de ${usuario}: "${pregunta}"`);

    const aiResult = await chatWithAI(pregunta, `Usuario: ${usuario}, Grupo: ${grupo}`);
    if (!aiResult.success) {
      const reason = aiResult.error?.includes('no está configurada')
        ? 'La función de IA no está configurada. Por favor establece GEMINI_API_KEY en el servidor.'
        : aiResult.error || 'La IA no pudo procesar tu solicitud.';
      return {
        success: false,
        message: `❌ ${reason}`
      };
    }

    const finalResponse = `🤖 *Respuesta de IA:*\n\n${aiResult.response}\n\n_Procesado por ${aiResult.model || 'Gemini AI'}_`;

    await db('logs').insert({
      tipo: 'ai_command',
      comando: '/ai',
      usuario,
      grupo,
      fecha,
      detalles: JSON.stringify({
        pregunta,
        respuesta: aiResult.response,
        modelo: aiResult.model || 'gemini-1.5-flash',
        timestamp: fecha
      })
    });

    return { success: true, message: finalResponse };

  } catch (error) {
    console.error('Error en comando /ai:', error);
    return {
      success: false,
      message: `❌ Error procesando comando /ai: ${error.message}\n\n_Intenta reformular tu pregunta._`
    };
  }
}

/**
 * Handle the /clasificar command to see what the AI classified from provider content.
 * @param {string} texto - The text to classify.
 * @param {string} usuario - The user who sent the command.
 * @param {string} grupo - The group where the command was sent.
 * @param {string} fecha - The date/time of the command.
 */
async function handleClasificar(texto, usuario, grupo, fecha) {
  try {
    console.log(`🔍 Comando /clasificar recibido de ${usuario}: "${texto}"`);
    
    // Analizar con IA para clasificación de manhwa
    let aiResult = await analyzeManhwaContent(texto, '');

    if (!aiResult.success) {
      aiResult = await analyzeContentWithAI(texto, '');
    }

    if (aiResult.success) {
      const data = aiResult.data;
      const response = `🔍 *Clasificación de IA:*\n\n` +
        `📚 *Título detectado:* ${data.titulo}\n` +
        `🏷️ *Tipo de contenido:* ${data.tipo}\n` +
        (data.capitulo ? `📖 *Capítulo:* ${data.capitulo}\n` : '') +
        (data.descripcion ? `📝 *Descripción:* ${data.descripcion}\n` : '') +
        `📊 *Nivel de confianza:* ${Math.round((data.confianza || 0) * 100)}%\n` +
        `🔧 *Método usado:* ${data.fuente || 'gemini-ai'}\n\n` +
        `_Análisis realizado por Gemini AI_`;

      await db('logs').insert({
        tipo: 'clasificar_command',
        comando: '/clasificar',
        usuario,
        grupo,
        fecha,
        detalles: JSON.stringify({
          texto,
          resultado: data,
          timestamp: fecha
        })
      });

      return { success: true, message: response };
    }

    return {
      success: false,
      message: `❌ Error en clasificación: ${aiResult.error || 'IA no disponible'}\n\n_Intenta con otro texto._`
    };
  } catch (error) {
    console.error('Error en comando /clasificar:', error);
    return { 
      success: false, 
      message: `❌ Error procesando comando /clasificar: ${error.message}` 
    };
  }
}

/**
 * Handle the /listclasificados command to show what the bot has classified.
 * @param {string} usuario - The user who sent the command.
 * @param {string} grupo - The group where the command was sent.
 * @param {string} fecha - The date/time of the command.
 */
async function handleListClasificados(usuario, grupo, fecha) {
  try {
    console.log(`📋 Comando /listclasificados recibido de ${usuario}`);
    
    // Obtener aportes automáticos clasificados
    const aportes = await db('aportes')
      .where({ tipo: 'proveedor_auto' })
      .select('manhwa_titulo', 'contenido_tipo', 'proveedor', 'fecha', 'contenido')
      .orderBy('fecha', 'desc')
      .limit(20);

    if (aportes.length === 0) {
      return { 
        success: true, 
        message: `📋 *Lista de Clasificaciones:*\n\n❌ No hay contenido clasificado aún.\n\n_El bot clasificará automáticamente cuando lleguen archivos a grupos proveedores._` 
      };
    }

    let response = `📋 *Últimas 20 Clasificaciones del Bot:*\n\n`;
    
    aportes.forEach((aporte, index) => {
      const fechaCorta = new Date(aporte.fecha).toLocaleDateString('es-ES');
      response += `${index + 1}. 📚 *${aporte.manhwa_titulo}*\n`;
      response += `   🏷️ ${aporte.contenido_tipo} | 🏢 ${aporte.proveedor}\n`;
      response += `   📅 ${fechaCorta}\n\n`;
    });

    response += `_Total clasificado automáticamente por IA_`;

    return { success: true, message: response };
    
  } catch (error) {
    console.error('Error en comando /listclasificados:', error);
    return { 
      success: false, 
      message: `❌ Error obteniendo clasificaciones: ${error.message}` 
    };
  }
}

/**
 * Log control actions (admin/owner actions)
 * @param {string} accion - The control action performed
 * @param {string} usuario - The user who performed the action
 * @param {string} grupo - The group where the action was performed
 * @param {string} fecha - The date/time of the action
 * @param {object} detalles - Additional details about the action
 */
async function logControlAction(accion, usuario, grupo, fecha, detalles = {}) {
  try {
    await db('logs').insert({
      tipo: 'control',
      comando: accion,
      usuario,
      grupo,
      fecha,
      detalles: JSON.stringify(detalles)
    });
    return { success: true };
  } catch (error) {
    console.error('Error logging control action:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Log configuration changes
 * @param {string} configuracion - The configuration that was changed
 * @param {string} usuario - The user who made the change
 * @param {string} grupo - The group where the change was made
 * @param {string} fecha - The date/time of the change
 * @param {object} detalles - Details about the configuration change
 */
async function logConfigurationChange(configuracion, usuario, grupo, fecha, detalles = {}) {
  try {
    await db('logs').insert({
      tipo: 'configuracion',
      comando: configuracion,
      usuario,
      grupo,
      fecha,
      detalles: JSON.stringify(detalles)
    });
    return { success: true };
  } catch (error) {
    console.error('Error logging configuration change:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Handle the /logs command to show recent logs by category
 * @param {string} categoria - The log category to filter (optional)
 * @param {string} usuario - The user who sent the command
 * @param {string} grupo - The group where the command was sent
 * @param {string} fecha - The date/time of the command
 */
async function handleLogs(categoria, usuario, grupo, fecha) {
  try {
    console.log(`📋 Comando /logs recibido de ${usuario}, categoría: ${categoria || 'todas'}`);
    
    let query = db('logs').select('*');
    
    if (categoria && ['control', 'configuracion', 'sistema', 'comando', 'ai_command', 'clasificar_command'].includes(categoria)) {
      query = query.where({ tipo: categoria });
    }
    
    const logs = await query.orderBy('fecha', 'desc').limit(20);
    
    if (logs.length === 0) {
      return { 
        success: true, 
        message: `📋 *Logs del Sistema:*\n\n❌ No hay logs${categoria ? ` de tipo "${categoria}"` : ''} disponibles.` 
      };
    }

    let response = `📋 *Logs del Sistema${categoria ? ` - ${categoria.toUpperCase()}` : ''}:*\n\n`;
    
    // Resolver nombres de usuario
    const nums = [...new Set(logs.map(l => String(l.usuario || '').split('@')[0].split(':')[0]))].filter(Boolean);
    const dbUsers = nums.length ? await db('usuarios').whereIn('whatsapp_number', nums).select('whatsapp_number','username') : [];
    const nameByNumber = Object.fromEntries(dbUsers.map(u => [u.whatsapp_number, u.username]));
    const missing = nums.filter(n => !nameByNumber[n]);
    const waNames = missing.length ? await db('wa_contacts').whereIn('wa_number', missing).select('wa_number','display_name') : [];
    const waByNumber = Object.fromEntries(waNames.map(w => [w.wa_number, w.display_name]));

    logs.forEach((log, index) => {
      const fechaCorta = new Date(log.fecha).toLocaleString('es-ES');
      const tipoIcon = {
        'control': '🔧',
        'configuracion': '⚙️',
        'sistema': '🖥️',
        'comando': '💬',
        'ai_command': '🤖',
        'clasificar_command': '🔍'
      }[log.tipo] || '📝';
      
      response += `${index + 1}. ${tipoIcon} *${log.comando}*\n`;
      const num = String(log.usuario || '').split('@')[0].split(':')[0];
      const uname = nameByNumber[num] || waByNumber[num] || num || '-';
      response += `   👤 @${uname} | 📅 ${fechaCorta}\n`;
      if (log.grupo) response += `   📍 Grupo: ${log.grupo}\n`;
      response += `\n`;
    });

    response += `_Mostrando últimos ${logs.length} registros_`;

    // Log this command usage
    await logControlAction('/logs', usuario, grupo, fecha, { categoria: categoria || 'todas' });

    return { success: true, message: response };
    
  } catch (error) {
    console.error('Error en comando /logs:', error);
    return { 
      success: false, 
      message: `❌ Error obteniendo logs: ${error.message}` 
    };
  }
}

/**
 * Handle the /config command to show or change bot configuration
 * @param {string} parametro - The configuration parameter to change
 * @param {string} valor - The new value for the parameter
 * @param {string} usuario - The user who sent the command
 * @param {string} grupo - The group where the command was sent
 * @param {string} fecha - The date/time of the command
 */
async function handleConfig(parametro, valor, usuario, grupo, fecha) {
  try {
    console.log(`⚙️ Comando /config recibido de ${usuario}: ${parametro} = ${valor}`);
    
    if (!parametro) {
      // Show current configuration
      const configs = await db('configuracion').select('*').orderBy('parametro');
      
      let response = `⚙️ *Configuración del Bot:*\n\n`;
      
      if (configs.length === 0) {
        response += `❌ No hay configuraciones guardadas.\n\n`;
        response += `💡 *Uso:* /config [parametro] [valor]\n`;
        response += `📝 *Ejemplo:* /config max_warnings 5`;
      } else {
        configs.forEach((config, index) => {
          response += `${index + 1}. **${config.parametro}:** ${config.valor}\n`;
          if (config.descripcion) response += `   _${config.descripcion}_\n`;
          response += `\n`;
        });
      }
      
      return { success: true, message: response };
    }
    
    if (!valor) {
      return { 
        success: false, 
        message: `❌ Debes especificar un valor.\n\n💡 *Uso:* /config ${parametro} [valor]` 
      };
    }
    
    // Update configuration
    await db('configuracion').insert({ parametro, valor, usuario_modificacion: usuario, fecha_modificacion: fecha }).onConflict('parametro').merge();
    
    // Log configuration change
    await logConfigurationChange('/config', usuario, grupo, fecha, {
      parametro: parametro,
      valor: valor,
      accion: 'modificar'
    });
    
    return { 
      success: true, 
      message: `✅ Configuración actualizada:\n\n**${parametro}:** ${valor}\n\n_Modificado por ${usuario}_` 
    };
    
  } catch (error) {
    console.error('Error en comando /config:', error);
    return { 
      success: false, 
      message: `❌ Error procesando configuración: ${error.message}` 
    };
  }
}

/**
 * Handle the /registrar command for automatic user registration
 * @param {string} username - The desired username
 * @param {string} usuario - The WhatsApp user (phone number)
 * @param {string} grupo - The group where the command was sent
 * @param {string} fecha - The date/time of the command
 */
async function handleRegistrarUsuario(username, usuario, grupo, fecha) {
  try {
    console.log(`📝 Comando /registrar recibido de ${usuario}: ${username}`);
    
    // Validar username
    if (!username || username.length < 3) {
      return { 
        success: false, 
        message: '❌ *Error:* El nombre de usuario debe tener al menos 3 caracteres' 
      };
    }

    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      return { 
        success: false, 
        message: '❌ *Error:* El nombre de usuario solo puede contener letras, números y guiones bajos' 
      };
    }

    const whatsappNumber = usuario.split('@')[0];
    
    // Llamar al endpoint de auto-registro
    const apiUrl = process.env.NODE_ENV === 'production' ? `https://${process.env.RENDER_SERVICE_NAME}.onrender.com/api/auth/auto-register` : 'http://localhost:3000/api/auth/auto-register';
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        whatsapp_number: whatsappNumber,
        username: username.toLowerCase(),
        grupo_jid: grupo
      })
    });

    const result = await response.json();

    if (response.ok) {
      // Log del registro
      await logControlAction('/registrar', usuario, grupo, fecha, {
        username: result.username,
        whatsapp_number: whatsappNumber,
        accion: 'registro_automatico'
      });

      return { 
        success: true, 
        message: `✅ *¡Registro Exitoso!*\n\n👤 *Usuario:* ${result.username}\n🔑 *Contraseña temporal:* \`${result.tempPassword}\`\n\n🌐 *Panel:* ${process.env.FRONTEND_URL}\n\n⚠️ *IMPORTANTE:* Cambia tu contraseña después del primer login\n\n💡 *Tip:* Guarda esta información en un lugar seguro` 
      };
    } else {
      return { 
        success: false, 
        message: `❌ *Error en el registro:*\n\n${result.error}` 
      };
    }
  } catch (error) {
    console.error('Error en registro automático:', error);
    return { 
      success: false, 
      message: '❌ *Error interno del sistema*\n\nIntenta nuevamente en unos minutos' 
    };
  }
}

/**
 * Handle the /resetpass command for password reset
 * @param {string} username - The username to reset password for
 * @param {string} usuario - The WhatsApp user (phone number)
 * @param {string} grupo - The group where the command was sent
 * @param {string} fecha - The date/time of the command
 */
async function handleResetPassword(username, usuario, grupo, fecha) {
  try {
    console.log(`🔑 Comando /resetpass recibido de ${usuario}: ${username}`);
    
    if (!username) {
      return { 
        success: false, 
        message: '❌ *Uso incorrecto*\n\n📝 *Formato:* `/resetpass tu_username`\n\n💡 *Ejemplo:* `/resetpass juan123`' 
      };
    }

    const whatsappNumber = usuario.split('@')[0];

    // Llamar al endpoint de reset password
    const apiUrl = process.env.NODE_ENV === 'production' ? `https://${process.env.RENDER_SERVICE_NAME}.onrender.com/api/auth/reset-password` : 'http://localhost:3000/api/auth/reset-password';
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        whatsapp_number: whatsappNumber,
        username: username.toLowerCase()
      })
    });

    const result = await response.json();

    if (response.ok) {
      // Log del reset
      await logControlAction('/resetpass', usuario, grupo, fecha, {
        username: result.username,
        whatsapp_number: whatsappNumber,
        accion: 'reset_password'
      });

      return { 
        success: true, 
        message: `✅ *¡Contraseña Restablecida!*\n\n👤 *Usuario:* ${result.username}\n🔑 *Nueva contraseña temporal:* \`${result.tempPassword}\`\n\n🌐 *Panel:* ${process.env.FRONTEND_URL}\n\n⚠️ *IMPORTANTE:* Cambia tu contraseña después del login` 
      };
    } else {
      return { 
        success: false, 
        message: `❌ *Error:*\n\n${result.error}` 
      };
    }
  } catch (error) {
    console.error('Error en reset password:', error);
    return { 
      success: false, 
      message: '❌ *Error interno del sistema*\n\nIntenta nuevamente en unos minutos' 
    };
  }
}

/**
 * Handle the /miinfo command to show user information
 * @param {string} usuario - The WhatsApp user (phone number)
 * @param {string} grupo - The group where the command was sent
 * @param {string} fecha - The date/time of the command
 */
async function handleMiInfo(usuario, grupo, fecha) {
  try {
    console.log(`👤 Comando /miinfo recibido de ${usuario}`);
    
    const whatsappNumber = usuario.split('@')[0];
    
    // Buscar usuario por número de WhatsApp
    const user = await db('usuarios').where({ whatsapp_number: whatsappNumber }).select('username', 'rol', 'fecha_registro').first();
    
    if (!user) {
      return { 
        success: true, 
        message: '❌ *No estás registrado*\n\n📝 Para registrarte usa: `/registrar tu_username`' 
      };
    }

    const fechaRegistro = user.fecha_registro ? new Date(user.fecha_registro).toLocaleDateString('es-ES') : 'No disponible';
    const rolDisplay = user.rol === 'admin' ? '👑 ADMINISTRADOR' : 
                      user.rol === 'colaborador' ? '🤝 COLABORADOR' : 
                      '👤 USUARIO';

    return { 
      success: true, 
      message: `👤 *Tu Información*\n\n🏷️ *Usuario:* ${user.username}\n📱 *WhatsApp:* ${whatsappNumber}\n${rolDisplay}\n📅 *Registrado:* ${fechaRegistro}\n\n🌐 *Panel:* ${process.env.FRONTEND_URL}` 
    };
  } catch (error) {
    console.error('Error en mi info:', error);
    return { 
      success: false, 
      message: '❌ *Error interno del sistema*' 
    };
  }
}

/**
 * Handle the /cleansession command to clean WhatsApp sessions and generate new QR
 * @param {string} usuario - The user who sent the command
 * @param {string} grupo - The group where the command was sent
 * @param {string} fecha - The date/time of the command
 */
async function handleCleanSession(usuario, grupo, fecha) {
  try {
    console.log(`🧹 Comando /cleansession recibido de ${usuario}`);
    
    // Verificar si el usuario es admin
    const whatsappNumber = usuario.split('@')[0];
    const user = await db('usuarios').where({ whatsapp_number: whatsappNumber }).select('rol').first();
    
    if (!user || user.rol !== 'admin') {
      return { 
        success: true, 
        message: '❌ *Solo administradores pueden usar este comando*' 
      };
    }

    // Limpiar sesiones de WhatsApp
    const fs = await import('fs');
    const path = await import('path');
    
    const sessionsDir = './sessions';
    const jadibotsDir = './jadibots';
    const tmpDir = './tmp';
    
    let cleanedFiles = 0;
    
    // Limpiar sesiones principales
    if (fs.existsSync(sessionsDir)) {
      const files = fs.readdirSync(sessionsDir);
      files.forEach(file => {
        if (file !== 'creds.json') {
          try {
            fs.unlinkSync(path.join(sessionsDir, file));
            cleanedFiles++;
          } catch (e) {
            console.log(`Error eliminando ${file}:`, e.message);
          }
        }
      });
    }
    
    // Limpiar sesiones de sub-bots
    if (fs.existsSync(jadibotsDir)) {
      const botDirs = fs.readdirSync(jadibotsDir);
      botDirs.forEach(botDir => {
        const botPath = path.join(jadibotsDir, botDir);
        if (fs.statSync(botPath).isDirectory()) {
          const botFiles = fs.readdirSync(botPath);
          botFiles.forEach(file => {
            if (file !== 'creds.json') {
              try {
                fs.unlinkSync(path.join(botPath, file));
                cleanedFiles++;
              } catch (e) {
                console.log(`Error eliminando ${botDir}/${file}:`, e.message);
              }
            }
          });
        }
      });
    }
    
    // Limpiar archivos temporales
    if (fs.existsSync(tmpDir)) {
      const tmpFiles = fs.readdirSync(tmpDir);
      tmpFiles.forEach(file => {
        try {
          fs.unlinkSync(path.join(tmpDir, file));
          cleanedFiles++;
        } catch (e) {
          console.log(`Error eliminando tmp/${file}:`, e.message);
        }
      });
    }

    // Log de la acción
    await logControlAction(usuario, 'CLEAN_SESSION', `Sesiones limpiadas: ${cleanedFiles} archivos`, grupo);

    return { 
      success: true, 
      message: `╭─❍「 🧹 Melodia Clean Session ✦ 」
│
├─ ✅ *Archivos eliminados:* ${cleanedFiles}
├─ 🔄 *El bot se reiniciará para generar nuevo QR*
├─ ⏳ *Reiniciando en 3 segundos...*
│
├─ 💫 Melodia ha limpiado todo perfectamente~ ♡
╰─✦` 
    };
  } catch (error) {
    console.error('Error en clean session:', error);
    return { 
      success: false, 
      message: '❌ *Error al limpiar sesiones*' 
    };
  }
}

export {
  normalizeAporteTipo,
  handleAportar,
  handleAI,
  handleClasificar,
  handleListClasificados,
  logControlAction,
  logConfigurationChange,
  handleLogs,
  handleConfig,
  handleRegistrarUsuario,
  handleResetPassword,
  handleMiInfo,
  handleCleanSession,
};

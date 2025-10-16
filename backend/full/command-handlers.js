// command-handlers.js
// Funciones handler para todos los comandos del bot de WhatsApp

import db from './db.js';
import { chatWithAI } from './gemini-ai-handler.js';
import { addAporte, addPedido, handlePedidos as getPedidos } from './handler.js';
import logger from './config/logger.js';

/**
 * Handler para el comando /ai o /ia
 * Interactúa con Gemini AI para responder preguntas
 */
export async function handleIA(pregunta, usuario, grupo) {
  try {
    console.log(`🤖 Comando /ai recibido de ${usuario}: "${pregunta}"`);

    const aiResult = await chatWithAI(pregunta, `Usuario: ${usuario}, Grupo: ${grupo}`);

    if (!aiResult.success) {
      const reason = aiResult.error?.includes('no está configurada')
        ? 'La función de IA no está configurada. Por favor establece GEMINI_API_KEY en el servidor.'
        : aiResult.error || 'La IA no pudo procesar tu solicitud.';
      return {
        success: false,
        message: `⚠️ ${reason}`
      };
    }

    const finalResponse = `🤖 *Respuesta de IA:*\n\n${aiResult.response}\n\n_Procesado por ${aiResult.model || 'Gemini AI'}_`;

    // Registrar en logs
    await db('logs').insert({
      tipo: 'ai_command',
      comando: '/ai',
      usuario,
      grupo,
      fecha: new Date().toISOString(),
      detalles: JSON.stringify({
        pregunta,
        respuesta: aiResult.response,
        modelo: aiResult.model || 'gemini-1.5-flash',
        timestamp: new Date().toISOString()
      })
    }).catch(err => logger.warn('Error guardando log de IA:', err));

    return { success: true, message: finalResponse };

  } catch (error) {
    console.error('❌ Error en comando /ai:', error);
    return {
      success: false,
      message: `⚠️ Error procesando comando /ai: ${error.message}\n\n_Intenta reformular tu pregunta._`
    };
  }
}

/**
 * Handler para el comando /myaportes
 * Muestra los aportes del usuario
 */
export async function handleMyAportes(usuario, grupo) {
  try {
    console.log(`📋 Comando /myaportes recibido de ${usuario}`);

    const aportes = await db('aportes')
      .where({ usuario })
      .orderBy('fecha', 'desc')
      .limit(10);

    if (aportes.length === 0) {
      return {
        success: true,
        message: '📭 *Mis Aportes*\n\nℹ️ No tienes aportes registrados aún.\n\n➕ Usa `/addaporte [contenido]` para agregar uno.'
      };
    }

    let message = '📋 *Mis Aportes*\n\n';
    aportes.forEach((aporte, index) => {
      message += `${index + 1}. **${aporte.contenido}**\n`;
      message += `   • Tipo: ${aporte.tipo}\n`;
      message += `   • Estado: ${aporte.estado || 'pendiente'}\n`;
      message += `   • Fecha: ${new Date(aporte.fecha).toLocaleDateString('es-ES')}\n\n`;
    });

    message += `_Total: ${aportes.length} aportes_`;

    return { success: true, message };

  } catch (error) {
    console.error('❌ Error en /myaportes:', error);
    return {
      success: false,
      message: '⚠️ Error obteniendo tus aportes. Intenta más tarde.'
    };
  }
}

/**
 * Handler para el comando /aportes
 * Muestra todos los aportes disponibles
 */
export async function handleAportes(usuario, grupo, isGroup = false) {
  try {
    console.log(`📚 Comando /aportes recibido de ${usuario}`);

    let query = db('aportes')
      .orderBy('fecha', 'desc')
      .limit(20);

    // Si es un grupo, mostrar solo aportes de ese grupo
    if (isGroup && grupo) {
      query = query.where({ grupo });
    }

    const aportes = await query;

    if (aportes.length === 0) {
      return {
        success: true,
        message: '📭 *Lista de Aportes*\n\nℹ️ No hay aportes disponibles en este momento.\n\n➕ Usa `/addaporte [contenido]` para agregar uno.'
      };
    }

    let message = '📚 *Lista de Aportes*\n\n';
    aportes.forEach((aporte, index) => {
      message += `${index + 1}. **${aporte.contenido}**\n`;
      message += `   • Tipo: ${aporte.tipo}\n`;
      message += `   • Estado: ${aporte.estado || 'pendiente'}\n`;
      message += `   👤 Por: ${aporte.usuario?.split('@')[0] || 'Anónimo'}\n`;
      message += `   🗓️ ${new Date(aporte.fecha).toLocaleDateString('es-ES')}\n\n`;
    });

    message += `_Total: ${aportes.length} aportes_`;

    return { success: true, message };

  } catch (error) {
    console.error('❌ Error en /aportes:', error);
    return {
      success: false,
      message: '⚠️ Error obteniendo aportes. Intenta más tarde.'
    };
  }
}

/**
 * Handler para el comando /addaporte
 * Agrega un nuevo aporte
 */
export async function handleAddAporte(contenido, tipo, usuario, grupo, fecha, archivoPath = null) {
  try {
    console.log(`➕ Comando /addaporte recibido de ${usuario}: "${contenido}"`);

    const result = await addAporte({
      contenido,
      tipo,
      usuario,
      grupo,
      fecha,
      mediaPath: archivoPath,
      estado: 'pendiente'
    });

    if (result.success) {
      let message = '✅ *Aporte registrado correctamente*\n\n';
      message += `📝 **Contenido:** ${contenido}\n`;
      message += `🏷️ **Tipo:** ${tipo}\n`;
      if (archivoPath) {
        message += `📎 **Archivo:** Adjunto\n`;
      }
      message += `📅 **Fecha:** ${new Date(fecha).toLocaleString('es-ES')}\n\n`;
      message += '✨ Tu aporte será revisado y publicado pronto.';

      return { success: true, message };
    }

    return result;

  } catch (error) {
    console.error('❌ Error en /addaporte:', error);
    return {
      success: false,
      message: '⚠️ Error agregando aporte. Intenta más tarde.'
    };
  }
}

/**
 * Handler para el comando /aporteestado
 * Cambia el estado de un aporte (solo admins)
 */
export async function handleAporteEstado(aporteId, nuevoEstado, usuario, grupo) {
  try {
    console.log(`🔄 Comando /aporteestado recibido de ${usuario}: ID=${aporteId}, Estado=${nuevoEstado}`);

    // Verificar que el usuario sea admin
    const whatsappNumber = usuario.split('@')[0];
    const user = await db('usuarios')
      .where({ whatsapp_number: whatsappNumber })
      .select('rol')
      .first();

    if (!user || (user.rol !== 'admin' && user.rol !== 'owner')) {
      return {
        success: false,
        message: '❌ Solo los administradores pueden cambiar el estado de los aportes.'
      };
    }

    // Validar estado
    const estadosValidos = ['pendiente', 'aprobado', 'rechazado', 'publicado'];
    if (!estadosValidos.includes(nuevoEstado.toLowerCase())) {
      return {
        success: false,
        message: `⚠️ Estado inválido. Estados válidos: ${estadosValidos.join(', ')}`
      };
    }

    // Actualizar estado
    const updated = await db('aportes')
      .where({ id: parseInt(aporteId) })
      .update({ estado: nuevoEstado.toLowerCase() });

    if (updated === 0) {
      return {
        success: false,
        message: `⚠️ No se encontró el aporte con ID ${aporteId}`
      };
    }

    return {
      success: true,
      message: `✅ Estado del aporte #${aporteId} actualizado a: **${nuevoEstado}**`
    };

  } catch (error) {
    console.error('❌ Error en /aporteestado:', error);
    return {
      success: false,
      message: '⚠️ Error actualizando estado del aporte.'
    };
  }
}

/**
 * Handler para el comando /pedido
 * Registra un nuevo pedido
 */
export async function handlePedido(contenido, usuario, grupo, fecha) {
  try {
    console.log(`📝 Comando /pedido recibido de ${usuario}: "${contenido}"`);

    const result = await addPedido({
      contenido,
      usuario,
      grupo,
      fecha
    });

    if (result.success) {
      return {
        success: true,
        message: `✅ *Pedido registrado*\n\n📝 **Contenido:** ${contenido}\n📅 **Fecha:** ${new Date(fecha).toLocaleString('es-ES')}\n\n✨ Tu pedido será procesado pronto.`
      };
    }

    return result;

  } catch (error) {
    console.error('❌ Error en /pedido:', error);
    return {
      success: false,
      message: '⚠️ Error registrando pedido. Intenta más tarde.'
    };
  }
}

/**
 * Handler para el comando /pedidos
 * Muestra los pedidos del usuario
 */
export async function handlePedidos(usuario, grupo) {
  try {
    console.log(`📋 Comando /pedidos recibido de ${usuario}`);
    return await getPedidos(usuario, grupo);
  } catch (error) {
    console.error('❌ Error en /pedidos:', error);
    return {
      success: false,
      message: '⚠️ Error obteniendo pedidos. Intenta más tarde.'
    };
  }
}

/**
 * Handler para el comando /lock
 * Bloquea el grupo (solo admins)
 */
export async function handleLock(usuario, grupo, isGroup) {
  try {
    if (!isGroup) {
      return {
        success: false,
        message: '⚠️ Este comando solo funciona en grupos.'
      };
    }

    // Verificar que el usuario sea admin del grupo
    const whatsappNumber = usuario.split('@')[0];
    const user = await db('usuarios')
      .where({ whatsapp_number: whatsappNumber })
      .select('rol')
      .first();

    if (!user || (user.rol !== 'admin' && user.rol !== 'owner')) {
      return {
        success: false,
        message: '❌ Solo los administradores pueden bloquear el grupo.'
      };
    }

    return {
      success: true,
      message: '🔒 *Grupo bloqueado*\n\nSolo los administradores pueden enviar mensajes.'
    };

  } catch (error) {
    console.error('❌ Error en /lock:', error);
    return {
      success: false,
      message: '⚠️ Error bloqueando el grupo.'
    };
  }
}

/**
 * Handler para el comando /unlock
 * Desbloquea el grupo (solo admins)
 */
export async function handleUnlock(usuario, grupo, isGroup) {
  try {
    if (!isGroup) {
      return {
        success: false,
        message: '⚠️ Este comando solo funciona en grupos.'
      };
    }

    // Verificar que el usuario sea admin del grupo
    const whatsappNumber = usuario.split('@')[0];
    const user = await db('usuarios')
      .where({ whatsapp_number: whatsappNumber })
      .select('rol')
      .first();

    if (!user || (user.rol !== 'admin' && user.rol !== 'owner')) {
      return {
        success: false,
        message: '❌ Solo los administradores pueden desbloquear el grupo.'
      };
    }

    return {
      success: true,
      message: '🔓 *Grupo desbloqueado*\n\nTodos los miembros pueden enviar mensajes.'
    };

  } catch (error) {
    console.error('❌ Error en /unlock:', error);
    return {
      success: false,
      message: '⚠️ Error desbloqueando el grupo.'
    };
  }
}

/**
 * Handler para el comando /tag
 * Menciona a todos en el grupo (solo admins)
 */
export async function handleTag(messageText, usuario, grupo) {
  try {
    console.log(`📢 Comando /tag recibido de ${usuario}`);

    const whatsappNumber = usuario.split('@')[0];
    const user = await db('usuarios')
      .where({ whatsapp_number: whatsappNumber })
      .select('rol')
      .first();

    if (!user || (user.rol !== 'admin' && user.rol !== 'owner')) {
      return {
        success: false,
        message: '❌ Solo los administradores pueden usar este comando.'
      };
    }

    const mensaje = messageText.substring(4).trim() || 'Todos mencionados';

    return {
      success: true,
      message: `📢 *Anuncio:*\n\n${mensaje}`,
      tagAll: true
    };

  } catch (error) {
    console.error('❌ Error en /tag:', error);
    return {
      success: false,
      message: '⚠️ Error enviando anuncio.'
    };
  }
}

/**
 * Handler para el comando /whoami
 * Muestra información del usuario
 */
export async function handleWhoami(usuario, grupo) {
  try {
    console.log(`👤 Comando /whoami recibido de ${usuario}`);

    const whatsappNumber = usuario.split('@')[0];
    const user = await db('usuarios')
      .where({ whatsapp_number: whatsappNumber })
      .select('username', 'rol', 'fecha_registro')
      .first();

    let message = '👤 *Tu Información*\n\n';
    message += `📱 **WhatsApp:** ${whatsappNumber}\n`;

    if (user) {
      message += `👨💼 **Usuario:** ${user.username}\n`;
      message += `🎭 **Rol:** ${user.rol}\n`;
      message += `📅 **Registrado:** ${new Date(user.fecha_registro).toLocaleDateString('es-ES')}\n`;
    } else {
      message += '\n⚠️ No estás registrado en el sistema.\n';
      message += 'Usa `/registrar [username]` para registrarte.';
    }

    return { success: true, message };

  } catch (error) {
    console.error('❌ Error en /whoami:', error);
    return {
      success: false,
      message: '⚠️ Error obteniendo tu información.'
    };
  }
}

/**
 * Handler para el comando /debugadmin
 * Información de depuración para admins
 */
export async function handleDebugAdmin(usuario, grupo) {
  try {
    console.log(`🔍 Comando /debugadmin recibido de ${usuario}`);

    const whatsappNumber = usuario.split('@')[0];
    const user = await db('usuarios')
      .where({ whatsapp_number: whatsappNumber })
      .select('rol')
      .first();

    if (!user || user.rol !== 'owner') {
      return {
        success: false,
        message: '❌ Solo el owner puede usar este comando.'
      };
    }

    const stats = {
      aportes: await db('aportes').count('* as count').first(),
      pedidos: await db('pedidos').count('* as count').first(),
      usuarios: await db('usuarios').count('* as count').first(),
      subbots: await db('subbots').count('* as count').first()
    };

    let message = '🔍 *Información del Sistema*\n\n';
    message += `📚 **Aportes:** ${stats.aportes?.count || 0}\n`;
    message += `📝 **Pedidos:** ${stats.pedidos?.count || 0}\n`;
    message += `👥 **Usuarios:** ${stats.usuarios?.count || 0}\n`;
    message += `🤖 **Subbots:** ${stats.subbots?.count || 0}\n`;
    message += `\n💾 **Base de datos:** Operativa\n`;
    message += `⏰ **Tiempo:** ${new Date().toLocaleString('es-ES')}`;

    return { success: true, message };

  } catch (error) {
    console.error('❌ Error en /debugadmin:', error);
    return {
      success: false,
      message: '⚠️ Error obteniendo información del sistema.'
    };
  }
}

// commands/advanced-features.js
// Funcionalidades avanzadas de Baileys: encuestas, mensajes efímeros, etiquetas, etc.

import logger from '../config/logger.js'

// Crear encuesta
export async function createPoll(ctx) {
  const { args, remoteJid, sock } = ctx

  if (args.length < 3) {
    return {
      success: false,
      message: '❌ Uso: /poll [pregunta] [opción1] [opción2] [opción3]...\n\nEjemplo: /poll ¿Cuál es tu color favorito? Rojo Azul Verde'
    }
  }

  const question = args[0]
  const options = args.slice(1)

  if (options.length < 2) {
    return { success: false, message: '❌ Debes proporcionar al menos 2 opciones' }
  }

  if (options.length > 12) {
    return { success: false, message: '❌ Máximo 12 opciones permitidas' }
  }

  try {
    await sock.sendMessage(remoteJid, {
      poll: {
        name: question,
        values: options,
        selectableCount: 1
      }
    })
    return { success: true, message: '✅ Encuesta creada' }
  } catch (error) {
    logger.error('Error creando encuesta:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

// Crear encuesta de selección múltiple
export async function createMultiSelectPoll(ctx) {
  const { args, remoteJid, sock } = ctx

  if (args.length < 4) {
    return {
      success: false,
      message: '❌ Uso: /multipoll [pregunta] [máx_selecciones] [opción1] [opción2]...\n\nEjemplo: /multipoll ¿Qué lenguajes conoces? 3 JavaScript Python Java PHP'
    }
  }

  const question = args[0]
  const maxSelections = parseInt(args[1])
  const options = args.slice(2)

  if (isNaN(maxSelections) || maxSelections < 1) {
    return { success: false, message: '❌ El número máximo de selecciones debe ser un número válido mayor a 0' }
  }

  if (options.length < 2) {
    return { success: false, message: '❌ Debes proporcionar al menos 2 opciones' }
  }

  if (options.length > 12) {
    return { success: false, message: '❌ Máximo 12 opciones permitidas' }
  }

  try {
    await sock.sendMessage(remoteJid, {
      poll: {
        name: question,
        values: options,
        selectableCount: maxSelections
      }
    })
    return { success: true, message: `✅ Encuesta de selección múltiple creada (máx. ${maxSelections} opciones)` }
  } catch (error) {
    logger.error('Error creando encuesta múltiple:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

// Mensaje efímero (desaparece)
export async function createViewOnce(ctx) {
  const { args, remoteJid, sock, quoted } = ctx

  if (!quoted) {
    return { success: false, message: '❌ Debes responder a un mensaje para hacerlo efímero' }
  }

  try {
    // Reenviar el mensaje como viewOnce
    await sock.sendMessage(remoteJid, {
      forward: quoted,
      viewOnce: true
    })
    return { success: true, message: '✅ Mensaje efímero enviado' }
  } catch (error) {
    logger.error('Error creando mensaje efímero:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

// Reenviar mensaje
export async function forwardMessage(ctx) {
  const { args, remoteJid, sock, quoted } = ctx

  if (!quoted) {
    return { success: false, message: '❌ Debes responder al mensaje que quieres reenviar' }
  }

  const targetJid = args[0]
  if (!targetJid) {
    return { success: false, message: '❌ Uso: /forward [número/JID]\n\nEjemplo: /forward 1234567890@s.whatsapp.net' }
  }

  try {
    await sock.sendMessage(targetJid, {
      forward: quoted
    })
    return { success: true, message: '✅ Mensaje reenviado' }
  } catch (error) {
    logger.error('Error reenviando mensaje:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

// Agregar etiqueta a chat
export async function addChatLabel(ctx) {
  const { args, remoteJid, sock } = ctx

  const labelId = args[0]
  if (!labelId) {
    return { success: false, message: '❌ Uso: /addchatlabel [ID_etiqueta]\n\nPrimero crea etiquetas en WhatsApp' }
  }

  try {
    await sock.addChatLabel(remoteJid, labelId)
    return { success: true, message: '✅ Etiqueta agregada al chat' }
  } catch (error) {
    logger.error('Error agregando etiqueta al chat:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

// Agregar etiqueta a mensaje
export async function addMessageLabel(ctx) {
  const { args, remoteJid, sock, quoted } = ctx

  if (!quoted) {
    return { success: false, message: '❌ Debes responder al mensaje para etiquetarlo' }
  }

  const labelId = args[0]
  if (!labelId) {
    return { success: false, message: '❌ Uso: /addmessagelabel [ID_etiqueta]\n\nPrimero crea etiquetas en WhatsApp' }
  }

  try {
    await sock.addMessageLabel(remoteJid, quoted.key.id, labelId)
    return { success: true, message: '✅ Etiqueta agregada al mensaje' }
  } catch (error) {
    logger.error('Error agregando etiqueta al mensaje:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

// Obtener perfil de negocio
export async function getBusinessProfile(ctx) {
  const { args, remoteJid, sock } = ctx

  const jid = args[0] || remoteJid.replace('@g.us', '@s.whatsapp.net')
  if (!jid.includes('@')) {
    return { success: false, message: '❌ Uso: /business [número] (opcional)' }
  }

  try {
    const profile = await sock.getBusinessProfile(jid)
    if (!profile) {
      return { success: false, message: '❌ No se encontró perfil de negocio' }
    }

    const message = `🏢 *Perfil de Negocio*

👤 *Nombre:* ${profile.name || 'N/D'}
📝 *Descripción:* ${profile.description || 'N/D'}
📧 *Email:* ${profile.email || 'N/D'}
🌐 *Website:* ${profile.website || 'N/D'}
📍 *Dirección:* ${profile.address || 'N/D'}
📞 *Teléfono:* ${profile.businessHours?.phone || 'N/D'}`

    return { success: true, message }
  } catch (error) {
    logger.error('Error obteniendo perfil de negocio:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

// Crear enlace de llamada
export async function createCallLink(ctx) {
  const { args, remoteJid, sock } = ctx

  const type = args[0] || 'video'
  if (!['video', 'audio'].includes(type)) {
    return { success: false, message: '❌ Tipo debe ser "video" o "audio"' }
  }

  try {
    const link = await sock.createCallLink(type)
    if (!link) {
      return { success: false, message: '❌ No se pudo crear el enlace de llamada' }
    }

    return {
      success: true,
      message: `📞 *Enlace de llamada ${type} creado*\n\n🔗 ${link}\n\nComparte este enlace para iniciar una llamada ${type}`
    }
  } catch (error) {
    logger.error('Error creando enlace de llamada:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

// Obtener catálogo de productos
export async function getCatalog(ctx) {
  const { args, remoteJid, sock } = ctx

  const jid = args[0] || remoteJid.replace('@g.us', '@s.whatsapp.net')
  if (!jid.includes('@')) {
    return { success: false, message: '❌ Uso: /catalog [número] (opcional)' }
  }

  try {
    const catalog = await sock.getCatalog({ jid })
    if (!catalog.products || catalog.products.length === 0) {
      return { success: false, message: '❌ No hay productos en el catálogo' }
    }

    let message = '🛍️ *Catálogo de Productos*\n\n'
    catalog.products.slice(0, 10).forEach((product, index) => {
      message += `${index + 1}. *${product.name}*\n`
      message += `   💰 ${product.price?.currency || ''} ${product.price?.amount || 'N/D'}\n`
      message += `   📝 ${product.description || 'Sin descripción'}\n\n`
    })

    if (catalog.products.length > 10) {
      message += `... y ${catalog.products.length - 10} productos más`
    }

    return { success: true, message }
  } catch (error) {
    logger.error('Error obteniendo catálogo:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

// Obtener colecciones del catálogo
export async function getCollections(ctx) {
  const { args, remoteJid, sock } = ctx

  const jid = args[0] || remoteJid.replace('@g.us', '@s.whatsapp.net')
  if (!jid.includes('@')) {
    return { success: false, message: '❌ Uso: /collections [número] (opcional)' }
  }

  try {
    const result = await sock.getCollections(jid)
    if (!result.collections || result.collections.length === 0) {
      return { success: false, message: '❌ No hay colecciones disponibles' }
    }

    let message = '📂 *Colecciones del Catálogo*\n\n'
    result.collections.forEach((collection, index) => {
      message += `${index + 1}. *${collection.name}*\n`
      message += `   📝 ${collection.description || 'Sin descripción'}\n`
      message += `   📊 ${collection.products_count || 0} productos\n\n`
    })

    return { success: true, message }
  } catch (error) {
    logger.error('Error obteniendo colecciones:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

export default {
  createPoll,
  createMultiSelectPoll,
  createViewOnce,
  forwardMessage,
  addChatLabel,
  addMessageLabel,
  getBusinessProfile,
  createCallLink,
  getCatalog,
  getCollections
}
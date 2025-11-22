import logger from '../config/logger.js'

export async function createPoll(ctx) {
  const { args, remoteJid, sock, quoted } = ctx

  if (args.length < 2) {
    return { 
      success: false, 
      message: '❌ Uso: /poll "Pregunta" "Opción1" "Opción2" ...' 
    }
  }

  const question = args[0]
  const options = args.slice(1)

  if (options.length < 2 || options.length > 4) {
    return { 
      success: false, 
      message: '❌ La encuesta debe tener entre 2 y 4 opciones' 
    }
  }

  try {
    await sock.sendMessage(remoteJid, {
      poll: {
        name: question,
        values: options,
        selectableCount: 1,
        toAnnouncementGroup: false
      }
    }, { quoted })
    
    return { success: true, message: '✅ Encuesta creada' }
  } catch (error) {
    logger.error('Error creando encuesta:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

export async function createMultiSelectPoll(ctx) {
  const { args, remoteJid, sock, quoted } = ctx

  if (args.length < 3) {
    return { 
      success: false, 
      message: '❌ Uso: /multipoll [max opciones] "Pregunta" "Opción1" "Opción2" ...' 
    }
  }

  const maxSelect = parseInt(args[0])
  const question = args[1]
  const options = args.slice(2)

  if (isNaN(maxSelect) || maxSelect < 1 || maxSelect > options.length) {
    return { 
      success: false, 
      message: '❌ El máximo debe ser entre 1 y el número de opciones' 
    }
  }

  if (options.length < 2 || options.length > 4) {
    return { 
      success: false, 
      message: '❌ La encuesta debe tener entre 2 y 4 opciones' 
    }
  }

  try {
    await sock.sendMessage(remoteJid, {
      poll: {
        name: question,
        values: options,
        selectableCount: maxSelect,
        toAnnouncementGroup: false
      }
    }, { quoted })
    
    return { success: true, message: `✅ Encuesta multi-selección creada (máx ${maxSelect})` }
  } catch (error) {
    logger.error('Error creando encuesta multi-selección:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

export async function createList(ctx) {
  const { args, remoteJid, sock, quoted, sender } = ctx

  if (args.length < 2) {
    return { 
      success: false, 
      message: '❌ Uso: /list [título] [opción1|opción2|...] [opción3|...]' 
    }
  }

  const title = args[0]
  const sections = []

  for (let i = 1; i < args.length; i++) {
    const sectionItems = args[i].split('|').map(item => ({
      title: item.trim(),
      rowId: `row_${i}_${Math.random().toString(36).substr(2, 9)}`
    }))

    sections.push({
      title: `Sección ${i}`,
      rows: sectionItems
    })
  }

  try {
    await sock.sendMessage(remoteJid, {
      text: title,
      sections: sections
    }, { quoted })
    
    return { success: true, message: '✅ Lista interactiva enviada' }
  } catch (error) {
    logger.error('Error creando lista:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

export async function forwardMessage(ctx) {
  const { quoted, remoteJid, sock } = ctx

  if (!quoted) {
    return { success: false, message: '❌ Responde al mensaje que deseas reenviar' }
  }

  try {
    await sock.sendMessage(remoteJid, { forward: quoted })
    return { success: true, message: '✅ Mensaje reenviado' }
  } catch (error) {
    logger.error('Error reenviando mensaje:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

export async function createViewOnce(ctx) {
  const { args, remoteJid, sock, quoted } = ctx

  if (!quoted || !quoted.message) {
    return { success: false, message: '❌ Responde a una imagen o video' }
  }

  try {
    const contentType = Object.keys(quoted.message)[0]
    
    if (contentType === 'imageMessage') {
      await sock.sendMessage(remoteJid, {
        image: quoted.message.imageMessage.url,
        viewOnce: true,
        caption: args.join(' ') || ''
      }, { quoted })
    } else if (contentType === 'videoMessage') {
      await sock.sendMessage(remoteJid, {
        video: quoted.message.videoMessage.url,
        viewOnce: true,
        caption: args.join(' ') || ''
      }, { quoted })
    } else {
      return { success: false, message: '❌ Solo imágenes y videos soportan ViewOnce' }
    }

    return { success: true, message: '✅ Media enviada como ViewOnce' }
  } catch (error) {
    logger.error('Error creando ViewOnce:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

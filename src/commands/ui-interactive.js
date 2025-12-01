// commands/ui-interactive.js
// Utilidades para crear menús interactivos compatibles con todas las versiones de WhatsApp

/**
 * Crea un menú con botones interactivos
 * @param {Object} config - Configuración del menú
 * @param {string} config.title - Título del menú
 * @param {string} config.body - Texto del cuerpo
 * @param {string} config.footer - Texto del pie
 * @param {Array} config.buttons - Array de botones [{text, id}]
 * @param {Array} config.mentions - Array de JIDs a mencionar
 * @returns {Object} Payload compatible
 */
export function createButtonMenu(config) {
  const { title, body, footer, buttons = [], mentions = [] } = config

  // Validar que haya botones
  if (!buttons || buttons.length === 0) {
    return {
      type: 'text',
      text: body || 'Menú sin opciones disponibles'
    }
  }

  // Limitar a 3 botones (límite de WhatsApp)
  const limitedButtons = buttons.slice(0, 3)

  // Formato moderno (buttonsMessage)
  const payload = {
    type: 'buttons',
    text: body || 'Selecciona una opción',
    footer: footer || '',
    buttons: limitedButtons.map((btn, idx) => ({
      text: btn.text || btn.displayText || `Opción ${idx + 1}`,
      id: btn.id || btn.command || `btn_${idx}`,
      type: 'quick_reply'
    }))
  }

  if (title) payload.header = title
  if (mentions.length > 0) payload.mentions = mentions

  return payload
}

/**
 * Crea un menú de lista con secciones
 * @param {Object} config - Configuración del menú
 * @param {string} config.title - Título del menú
 * @param {string} config.body - Descripción
 * @param {string} config.footer - Pie de página
 * @param {string} config.buttonText - Texto del botón
 * @param {Array} config.sections - Secciones con opciones
 * @param {Array} config.mentions - Array de JIDs a mencionar
 * @returns {Object} Payload compatible
 */
export function createListMenu(config) {
  const {
    title,
    body,
    footer,
    buttonText = 'Ver opciones',
    sections = [],
    mentions = []
  } = config

  // Validar que haya secciones
  if (!sections || sections.length === 0) {
    return {
      type: 'text',
      text: body || 'Menú sin opciones disponibles'
    }
  }

  // Formato de lista
  const payload = {
    type: 'list',
    title: title || 'Menú',
    text: body || 'Selecciona una opción',
    buttonText: buttonText,
    sections: sections.map(section => ({
      title: section.title || 'Opciones',
      rows: (section.rows || []).map((row, idx) => ({
        title: row.title || row.text || `Opción ${idx + 1}`,
        description: row.description || '',
        rowId: row.rowId || row.id || row.command || `row_${idx}`
      }))
    }))
  }

  if (footer) payload.footer = footer
  if (mentions.length > 0) payload.mentions = mentions

  return payload
}

/**
 * Crea un menú con opciones numeradas (fallback universal)
 * Funciona en TODAS las versiones de WhatsApp
 * @param {Object} config - Configuración del menú
 * @param {string} config.title - Título del menú
 * @param {string} config.body - Descripción
 * @param {Array} config.options - Opciones [{text, command}]
 * @param {string} config.footer - Pie de página
 * @returns {Object} Payload de texto con opciones numeradas
 */
export function createNumberedMenu(config) {
  const { title, body, options = [], footer } = config

  if (!options || options.length === 0) {
    return {
      type: 'text',
      text: body || 'Menú sin opciones disponibles'
    }
  }

  const lines = []

  // Título
  if (title) {
    lines.push(`╔═══════════════════╗`)
    lines.push(`║ ${title.toUpperCase().padEnd(17)} ║`)
    lines.push(`╚═══════════════════╝`)
    lines.push('')
  }

  // Descripción
  if (body) {
    lines.push(body)
    lines.push('')
  }

  // Opciones numeradas
  lines.push('📋 *Opciones disponibles:*')
  lines.push('')

  options.forEach((opt, idx) => {
    const number = idx + 1
    const text = opt.text || opt.title || `Opción ${number}`
    const cmd = opt.command || opt.id || ''

    if (cmd) {
      lines.push(`*${number}.* ${text}`)
      lines.push(`   ↳ _${cmd}_`)
    } else {
      lines.push(`*${number}.* ${text}`)
    }
  })

  // Footer
  if (footer) {
    lines.push('')
    lines.push(`_${footer}_`)
  }

  // Store options in metadata for button handling
  return {
    type: 'text',
    text: lines.join('\n'),
    buttonsData: options.map((opt, idx) => ({
      number: idx + 1,
      command: opt.command || opt.id
    }))
  }
}

/**
 * Crea un menú adaptativo que intenta usar botones y hace fallback a texto
 * @param {Object} config - Configuración del menú
 * @returns {Object} Payload óptimo según la configuración
 */
export function createAdaptiveMenu(config) {
  const { options = [], sections = [] } = config

  // Si hay secciones, usar lista
  if (sections.length > 0) {
    return createListMenu(config)
  }

  // Si hay 1-3 opciones, usar botones
  if (options.length > 0 && options.length <= 3) {
    return createButtonMenu({
      ...config,
      buttons: options
    })
  }

  // Si hay 4-10 opciones, usar lista con una sección
  if (options.length >= 4 && options.length <= 10) {
    return createListMenu({
      ...config,
      sections: [{
        title: config.title || 'Opciones',
        rows: options
      }]
    })
  }

  // Para más de 10 opciones o como fallback, usar menú numerado
  return createNumberedMenu(config)
}

/**
 * Formatea menciones para WhatsApp
 * @param {Array} numbers - Array de números (sin @)
 * @returns {Array} Array de JIDs con formato correcto
 */
export function formatMentions(numbers) {
  if (!Array.isArray(numbers)) return []

  return numbers
    .filter(n => n && String(n).trim())
    .map(n => {
      const clean = String(n).replace(/\D/g, '')
      return `${clean}@s.whatsapp.net`
    })
}

/**
 * Crea un mensaje con mención
 * @param {string} text - Texto del mensaje
 * @param {Array} numbers - Números a mencionar
 * @returns {Object} Payload con menciones
 */
export function createMentionMessage(text, numbers) {
  return {
    type: 'text',
    text: text,
    mentions: formatMentions(numbers)
  }
}

/**
 * Crea un menú de confirmación (Sí/No)
 * @param {string} question - Pregunta a confirmar
 * @param {string} yesCommand - Comando para "Sí"
 * @param {string} noCommand - Comando para "No"
 * @returns {Object} Payload del menú
 */
export function createConfirmMenu(question, yesCommand, noCommand) {
  return createButtonMenu({
    body: question,
    buttons: [
      { text: '✅ Sí', id: yesCommand },
      { text: '❌ No', id: noCommand }
    ]
  })
}

/**
 * Crea una encuesta (poll)
 * @param {Object} config - Configuración
 * @param {string} config.title - Pregunta
 * @param {Array} config.options - Opciones
 * @param {boolean} config.allowMultiple - Permitir múltiples respuestas
 * @returns {Object} Payload de encuesta
 */
export function createPoll(config) {
  const { title, options = [], allowMultiple = false } = config

  if (!options || options.length < 2) {
    return {
      type: 'text',
      text: '⚠️ Una encuesta necesita al menos 2 opciones'
    }
  }

  return {
    type: 'poll',
    title: title || '📊 Encuesta',
    options: options.map(opt => typeof opt === 'string' ? opt : opt.text || opt.title),
    allowMultiple: allowMultiple,
    selectableCount: allowMultiple ? options.length : 1
  }
}

/**
 * Crea un mensaje de error formateado
 * @param {string} message - Mensaje de error
 * @returns {Object} Payload de error
 */
export function createErrorMessage(message) {
  return {
    type: 'text',
    text: `❌ *Error*\n\n${message}`,
    success: false
  }
}

/**
 * Crea un mensaje de éxito formateado
 * @param {string} message - Mensaje de éxito
 * @returns {Object} Payload de éxito
 */
export function createSuccessMessage(message) {
  return {
    type: 'text',
    text: `✅ *Éxito*\n\n${message}`,
    success: true
  }
}

/**
 * Crea un mensaje de información formateado
 * @param {string} message - Mensaje informativo
 * @returns {Object} Payload de información
 */
export function createInfoMessage(message) {
  return {
    type: 'text',
    text: `ℹ️ *Información*\n\n${message}`
  }
}

/**
 * Crea un mensaje de advertencia formateado
 * @param {string} message - Mensaje de advertencia
 * @returns {Object} Payload de advertencia
 */
export function createWarningMessage(message) {
  return {
    type: 'text',
    text: `⚠️ *Advertencia*\n\n${message}`
  }
}

export default {
  createButtonMenu,
  createListMenu,
  createNumberedMenu,
  createAdaptiveMenu,
  formatMentions,
  createMentionMessage,
  createConfirmMenu,
  createPoll,
  createErrorMessage,
  createSuccessMessage,
  createInfoMessage,
  createWarningMessage
}

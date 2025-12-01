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
  const { options = [], sections = [], jid } = config

  // 🚨 Si es un canal, SIEMPRE usar texto numerado
  const isChannel = jid && (String(jid).endsWith('@newsletter') || String(jid).endsWith('@lid'))

  if (isChannel) {
    console.log('[ui-interactive] Canal detectado - usando menú numerado')
    return createNumberedMenu(config)
  }

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

/**
 * Envía una lista categorizada (LEGACY - usado por menu.js y admin-menu.js)
 * @param {Object} sock - Socket de Baileys
 * @param {string} jid - JID del destinatario
 * @param {Object} config - Configuración
 * @returns {Promise<Object>} Resultado del envío
 */
export async function sendCategorizedList(sock, jid, config) {
  const { title, description, buttonText, categories, footer } = config

  // 🚨 Detectar si es un canal
  const isChannel = String(jid).endsWith('@newsletter') || String(jid).endsWith('@lid')

  if (isChannel) {
    console.log('[sendCategorizedList] Canal detectado - usando formato texto')

    const lines = []
    if (title) {
      lines.push(`*${title}*`)
      lines.push('═'.repeat(30))
      lines.push('')
    }

    if (description) {
      lines.push(description)
      lines.push('')
    }

    for (const cat of (categories || [])) {
      lines.push(`📌 *${cat.title || 'Categoría'}*`)
      for (const item of (cat.items || [])) {
        lines.push(`  • ${item.name || item.title}`)
        if (item.description) lines.push(`    ${item.description}`)
        if (item.command) lines.push(`    ↳ ${item.command}`)
      }
      lines.push('')
    }

    if (footer) {
      lines.push(`_${footer}_`)
    }

    return {
      type: 'text',
      text: lines.join('\n')
    }
  }

  // Convertir categorías al formato de secciones
  const sections = (categories || []).map(cat => ({
    title: cat.title || cat.name || 'Categoría',
    rows: (cat.items || cat.commands || []).map(item => ({
      title: item.name || item.title || item.command,
      description: item.description || item.desc || '',
      rowId: item.command || item.id || item.rowId
    }))
  }))

  const payload = createListMenu({
    title,
    body: description,
    buttonText,
    sections,
    footer
  })

  return payload
}

/**
 * Envía botones interactivos (LEGACY - usado por system-info.js)
 * @param {Object} sock - Socket de Baileys
 * @param {string} jid - JID del destinatario
 * @param {Object} config - Configuración
 * @returns {Promise<Object>} Resultado del envío
 */
export async function sendInteractiveButtons(sock, jid, config) {
  const { title, body, footer, buttons } = config

  const payload = createButtonMenu({
    title,
    body,
    footer,
    buttons: (buttons || []).map(btn => ({
      text: btn.text || btn.buttonText,
      id: btn.id || btn.buttonId
    }))
  })

  return payload
}

/**
 * Envía código copiable (LEGACY - usado por pairing.js)
 * @param {Object} sock - Socket de Baileys
 * @param {string} jid - JID del destinatario
 * @param {Object} config - Configuración
 * @returns {Promise<Object>} Resultado del envío
 */
export async function sendCopyableCode(sock, jid, config) {
  const { title, code, description } = config

  // WhatsApp no soporta botones de "copiar" nativos en todas las versiones
  // Enviamos el código en formato texto con instrucciones
  const text = [
    title || '📋 *Código de Emparejamiento*',
    '',
    description || 'Copia el siguiente código:',
    '',
    `\`\`\`${code}\`\`\``,
    '',
    '💡 _Mantén presionado el código para copiarlo_'
  ].join('\n')

  return {
    type: 'text',
    text
  }
}

/**
 * Crea un menú con secciones expandibles
 * @param {Object} config - Configuración
 * @returns {Object} Payload del menú
 */
export function createExpandableMenu(config) {
  const { sections, title, footer } = config

  if (!sections || sections.length === 0) {
    return createInfoMessage('No hay opciones disponibles')
  }

  const lines = []

  if (title) {
    lines.push(`*${title}*`)
    lines.push('═'.repeat(30))
    lines.push('')
  }

  sections.forEach((section, idx) => {
    lines.push(`📌 *${section.title || `Sección ${idx + 1}`}*`)

    if (section.items) {
      section.items.forEach(item => {
        lines.push(`   • ${item.name || item.title}`)
        if (item.command) {
          lines.push(`     ↳ \`${item.command}\``)
        }
      })
    }

    lines.push('')
  })

  if (footer) {
    lines.push(`_${footer}_`)
  }

  return {
    type: 'text',
    text: lines.join('\n')
  }
}

/**
 * Crea un mensaje con código formateado
 * @param {string} code - Código a mostrar
 * @param {string} language - Lenguaje del código
 * @returns {Object} Payload del mensaje
 */
export function createCodeMessage(code, language = '') {
  return {
    type: 'text',
    text: `\`\`\`${language}\n${code}\n\`\`\``
  }
}

/**
 * Crea un mensaje de carga/espera
 * @param {string} message - Mensaje de carga
 * @returns {Object} Payload del mensaje
 */
export function createLoadingMessage(message = 'Procesando...') {
  return {
    type: 'text',
    text: `⏳ ${message}`
  }
}

/**
 * Crea un menú de paginación
 * @param {Object} config - Configuración
 * @param {number} config.currentPage - Página actual
 * @param {number} config.totalPages - Total de páginas
 * @param {Array} config.items - Items de la página actual
 * @param {string} config.commandPrefix - Prefijo del comando de navegación
 * @returns {Object} Payload del menú
 */
export function createPaginatedMenu(config) {
  const { currentPage = 1, totalPages = 1, items = [], commandPrefix = '/page' } = config

  const lines = []

  lines.push(`📄 *Página ${currentPage} de ${totalPages}*`)
  lines.push('═'.repeat(30))
  lines.push('')

  items.forEach((item, idx) => {
    lines.push(`${idx + 1}. ${item.title || item.text || item}`)
    if (item.description) {
      lines.push(`   _${item.description}_`)
    }
    if (item.command) {
      lines.push(`   ↳ ${item.command}`)
    }
  })

  lines.push('')
  lines.push('*Navegación:*')

  const buttons = []

  if (currentPage > 1) {
    buttons.push({ text: '⬅️ Anterior', id: `${commandPrefix} ${currentPage - 1}` })
  }

  if (currentPage < totalPages) {
    buttons.push({ text: 'Siguiente ➡️', id: `${commandPrefix} ${currentPage + 1}` })
  }

  if (buttons.length > 0) {
    return createButtonMenu({
      body: lines.join('\n'),
      buttons
    })
  }

  return {
    type: 'text',
    text: lines.join('\n')
  }
}

/**
 * Formatea un mensaje de tabla
 * @param {Array} headers - Encabezados de la tabla
 * @param {Array} rows - Filas de la tabla
 * @returns {string} Texto formateado
 */
export function formatTable(headers, rows) {
  const lines = []

  // Encabezados
  lines.push(headers.join(' | '))
  lines.push(headers.map(() => '---').join('|'))

  // Filas
  rows.forEach(row => {
    lines.push(row.join(' | '))
  })

  return '```\n' + lines.join('\n') + '\n```'
}

/**
 * Crea un mensaje de progreso con barra
 * @param {number} current - Valor actual
 * @param {number} total - Valor total
 * @param {string} label - Etiqueta
 * @returns {Object} Payload del mensaje
 */
export function createProgressMessage(current, total, label = 'Progreso') {
  const percentage = Math.round((current / total) * 100)
  const filled = Math.round(percentage / 10)
  const empty = 10 - filled

  const bar = '█'.repeat(filled) + '░'.repeat(empty)

  return {
    type: 'text',
    text: `${label}\n${bar} ${percentage}%\n${current}/${total}`
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
  createWarningMessage,
  sendCategorizedList,
  sendInteractiveButtons,
  sendCopyableCode,
  createExpandableMenu,
  createCodeMessage,
  createLoadingMessage,
  createPaginatedMenu,
  formatTable,
  createProgressMessage
}

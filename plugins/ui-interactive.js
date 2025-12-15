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
  const { title, body, footer, buttons = [], mentions = [] } = config || {}

  // Validar que haya botones
  if (!buttons || buttons.length === 0) {
    return {
      type: 'text',
      text: body || 'Menú sin opciones disponibles'
    }
  }

  // Limitar a 3 botones (límite de WhatsApp)
  const limitedButtons = buttons.slice(0, 3)

    // Formato Baileys buttonsMessage (compatible en grupos y privados)
  const ensureSlash = (id) => {
    const s = String(id || '').trim()
    if (!s) return '/help'
    return s.startsWith('/') ? s : `/${s}`
  }

  const payload = {
    type: 'buttons',
    text: body || 'Selecciona una opci?n',
    footer: footer || '',
    buttons: limitedButtons.map((btn, idx) => ({
      buttonId: ensureSlash(btn.id || btn.command || btn.buttonId || btn.rowId || (btn.copy ? `/copy ${btn.copy}` : null) || '/help'),
      buttonText: { displayText: btn.text || btn.displayText || btn.title || `Opci?n ${idx + 1}` },
      type: 1
    })),
    headerType: 1
  }

  if (title) payload.title = title
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
 * @param {boolean} config.forceTextMode - Forzar modo texto
 * @returns {Object} Payload compatible
 */
export function createListMenu(config) {
  const {
    title,
    body,
    footer,
    buttonText = 'Ver opciones',
    sections = [],
    mentions = [],
    forceTextMode = false // Por defecto intenta interactivos
  } = (config || {})

  // Validar que haya secciones
  if (!sections || sections.length === 0) {
    return {
      type: 'text',
      text: body || 'Menú sin opciones disponibles'
    }
  }

  // 🚨 Solo usar texto si se fuerza explícitamente
  if (forceTextMode === true) {
    console.log('[createListMenu] Modo texto forzado')

    const lines = []

    if (title) {
      lines.push(`╔═══════════════════════════╗`)
      lines.push(`║ ${title.toUpperCase().padEnd(25)} ║`)
      lines.push(`╚═══════════════════════════╝`)
      lines.push('')
    }

    if (body) {
      lines.push(body)
      lines.push('')
    }

    let optionNumber = 1
    for (const section of sections) {
      lines.push(`📌 *${section.title || 'Opciones'}*`)
      lines.push('')

      for (const row of (section.rows || [])) {
        lines.push(`*${optionNumber}.* ${row.title || row.text || 'Opción'}`)
        if (row.description) {
          lines.push(`   _${row.description}_`)
        }
        if (row.rowId || row.id || row.command) {
          lines.push(`   ↳ \`${row.rowId || row.id || row.command}\``)
        }
        lines.push('')
        optionNumber++
      }
    }

    if (footer) {
      lines.push(`_${footer}_`)
    }

    return {
      type: 'text',
      text: lines.join('\n'),
      mentions
    }
  }

  // ✅ Formato de lista interactiva (por defecto)
  console.log('[createListMenu] Usando formato listMessage')
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
  const { title, body, options = [], footer } = (config || {})

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
  const { options = [], sections = [], forceTextMode = false } = (config || {})

  // Solo forzar texto si se especifica explícitamente
  if (forceTextMode === true) {
    console.log('[createAdaptiveMenu] Modo texto forzado')

    if (sections.length > 0) {
      return createListMenu({ ...config, forceTextMode: true })
    }

    return createNumberedMenu(config)
  }

  // ✅ Intentar formatos interactivos por defecto
  if (sections.length > 0) {
    return createListMenu(config)
  }

  if (options.length > 0 && options.length <= 3) {
    return createButtonMenu({
      ...config,
      buttons: options
    })
  }

  if (options.length >= 4 && options.length <= 10) {
    return createListMenu({
      ...config,
      sections: [{
        title: config.title || 'Opciones',
        rows: options
      }]
    })
  }

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
function normalizeListArgs(args = []) {
  if (args.length === 1 && typeof args[0] === "object" && !Array.isArray(args[0])) return args[0] || {};
  if (args.length === 2 && typeof args[0] === "string" && Array.isArray(args[1])) return { body: args[0], description: args[0], sections: args[1], categories: args[1] };
  if (args.length === 3 && typeof args[2] === "object") return args[2] || {};
  return {};
}

export async function sendCategorizedList(...args) {
  const cfg = normalizeListArgs(args);
  const {
    title,
    description,
    buttonText = "Ver opciones",
    categories = [],
    sections: providedSections = [],
    footer,
    mentions,
    forceTextMode = false,
  } = cfg || {};

  const sections = (providedSections.length ? providedSections : categories).map(cat => ({
    title: cat.title || cat.name || 'Categor?a',
    rows: (cat.items || cat.commands || cat.rows || []).map(item => ({
      title: item.name || item.title || item.command,
      description: item.description || item.desc || "",
      rowId: item.command || item.id || item.rowId
    }))
  }));

  return createListMenu({
    title,
    body: description || cfg.body,
    buttonText,
    sections,
    footer,
    mentions,
    forceTextMode
  });
}

function normalizeButtonsArgs(args = []) {
  if (args.length === 1 && typeof args[0] === "object" && !Array.isArray(args[0])) return args[0] || {};
  if (args.length === 2 && typeof args[0] === "string" && Array.isArray(args[1])) return { body: args[0], buttons: args[1] };
  if (args.length === 3 && typeof args[2] === "object") return args[2] || {};
  if (args.length >= 1) return { body: String(args[0] || ""), buttons: Array.isArray(args[1]) ? args[1] : [] };
  return {};
}

export async function sendInteractiveButtons(...args) {
  const cfg = normalizeButtonsArgs(args);
  const { title, body, footer, buttons = [], mentions } = cfg || {};

  return createButtonMenu({
    title,
    body: body || cfg.text || cfg.message || title,
    footer,
    mentions,
    buttons: (buttons || []).map(btn => ({
      text: btn.text || btn.buttonText || btn.title || btn.displayText,
      id: btn.id || btn.command || btn.buttonId || btn.rowId || btn.url
    }))
  });
}

export async function sendCopyableCode(...args) {
  let cfg = {};
  if (args.length === 1 && typeof args[0] === "object") {
    cfg = args[0] || {};
  } else if (args.length >= 2 && typeof args[0] === "string" && typeof args[1] === "string") {
    cfg = { code: args[0], title: args[1] };
  } else if (args.length >= 1) {
    cfg = { code: args[0], ...(typeof args[1] === "object" ? args[1] : {}) };
  }

  const { title, code, description } = cfg;

  const text = [
    title || 'Codigo',
    "",
    description || 'Copia el siguiente codigo:',
    "",
    `\`\`\`${code || ""}\`\`\``,
    "",
    'Manten presionado el codigo para copiarlo'
  ].join("\n");

  return {
    type: "text",
    text,
    quoted: cfg.quoted
  };
}

// ============================================================
// Comandos interactivos y utilidades de ayuda
// ============================================================
const todoStore = global.__UI_TODO_STORE || (global.__UI_TODO_STORE = new Map());

function getTodoList(key) {
  const k = key || 'default';
  if (!todoStore.has(k)) todoStore.set(k, []);
  return todoStore.get(k);
}

function renderTodoList(list = []) {
  if (!list.length) {
    return 'Lista vacia. Usa /todo-add <tarea> para agregar.';
  }
  const lines = ['Tareas:', ''];
  list.forEach((item, idx) => {
    lines.push(`${idx + 1}. [${item.done ? 'x' : ' '}] ${item.text}`);
  });
  lines.push('');
  lines.push('Usa /todo-add, /todo-mark <n>, /todo-unmark <n> o /todo-delete <n>.');
  return lines.join('\n');
}

export async function copyCode(ctx = {}) {
  const raw = Array.isArray(ctx.args) ? ctx.args.join(' ').trim() : '';
  const fallback = ctx.text ? String(ctx.text).replace(/^\/copy\s*/i, '').trim() : '';
  const code = raw || fallback || "console.log('KONMI BOT');";
  return sendCopyableCode({ code, title: 'Codigo', description: 'Manten presionado para copiarlo', quoted: true });
}

export async function handleCopyButton(ctx = {}) {
  return copyCode(ctx);
}

export async function interactiveButtons(ctx = {}) {
  const buttons = [
    { text: 'Menu', command: '/menu' },
    { text: 'Ayuda', command: '/help' },
    { text: 'Estado', command: '/status' },
  ];
  return sendInteractiveButtons({
    title: 'Panel rapido',
    body: 'Selecciona una opcion:',
    buttons,
    footer: ctx.isGroup ? 'En grupos escribe el comando' : undefined,
  });
}

export async function createTodoList(ctx = {}) {
  const list = getTodoList(ctx.remoteJid);
  if (Array.isArray(ctx.args) && ctx.args.length) {
    const items = ctx.args.join(' ').split(',').map(s => s.trim()).filter(Boolean);
    items.forEach(text => list.push({ text, done: false }));
  }
  return { type: 'text', text: renderTodoList(list), quoted: true };
}

export async function addTodoItem(ctx = {}) {
  const text = Array.isArray(ctx.args) ? ctx.args.join(' ').trim() : '';
  if (!text) return { type: 'text', text: 'Uso: /todo-add <tarea>', quoted: true };
  const list = getTodoList(ctx.remoteJid);
  list.push({ text, done: false });
  return { type: 'text', text: renderTodoList(list), quoted: true };
}

export async function markTodoItem(ctx = {}) {
  const idx = parseInt((ctx.args || [])[0], 10) - 1;
  const list = getTodoList(ctx.remoteJid);
  if (!Number.isInteger(idx) || idx < 0 || idx >= list.length) return { type: 'text', text: 'Uso: /todo-mark <numero>', quoted: true };
  list[idx].done = true;
  return { type: 'text', text: renderTodoList(list), quoted: true };
}

export async function unmarkTodoItem(ctx = {}) {
  const idx = parseInt((ctx.args || [])[0], 10) - 1;
  const list = getTodoList(ctx.remoteJid);
  if (!Number.isInteger(idx) || idx < 0 || idx >= list.length) return { type: 'text', text: 'Uso: /todo-unmark <numero>', quoted: true };
  list[idx].done = false;
  return { type: 'text', text: renderTodoList(list), quoted: true };
}

export async function deleteTodoItem(ctx = {}) {
  const idx = parseInt((ctx.args || [])[0], 10) - 1;
  const list = getTodoList(ctx.remoteJid);
  if (!Number.isInteger(idx) || idx < 0 || idx >= list.length) return { type: 'text', text: 'Uso: /todo-delete <numero>', quoted: true };
  list.splice(idx, 1);
  return { type: 'text', text: renderTodoList(list), quoted: true };
}

async function buildHelpSections(filterCategory = null) {
  const { getCommandRegistry } = await import('./registry/index.js');
  const reg = getCommandRegistry();
  const map = new Map();

  for (const [cmd, meta] of reg.entries()) {
    const cat = (meta?.category || 'otros').toLowerCase();
    if (filterCategory && cat !== filterCategory) continue;
    if (!map.has(cat)) map.set(cat, []);
    map.get(cat).push({ command: cmd, description: meta?.description || '' });
  }

  for (const list of map.values()) {
    list.sort((a, b) => a.command.localeCompare(b.command));
  }

  return Array.from(map.entries()).map(([cat, cmds]) => ({
    title: cat.charAt(0).toUpperCase() + cat.slice(1),
    rows: cmds.map(c => ({
      title: c.command,
      description: c.description,
      rowId: c.command
    }))
  }));
}

export async function categorizedMenu(ctx = {}) {
  const sections = await buildHelpSections();
  const body = 'Menú por categorías. Selecciona un comando.';
  return createListMenu({
    title: 'Menú',
    body,
    sections,
    buttonText: 'Ver comandos',
    // Antes se forzaba modo texto en grupos; ahora se permiten interactivos también en grupos.
    forceTextMode: false
  });
}

export async function helpByCategory(ctx = {}) {
  const filter = (ctx.args || [])[0] ? String(ctx.args[0]).toLowerCase() : null;
  const sections = await buildHelpSections(filter);
  if (!sections.length) return { type: 'text', text: 'Categoría sin comandos.', quoted: true };
  const body = filter ? `Comandos en ${filter}` : 'Selecciona una categoría o comando';
  return createListMenu({
    title: 'Ayuda por categorías',
    body,
    sections,
    buttonText: 'Ver',
    // Habilitamos lista interactiva también en grupos
    forceTextMode: false,
    footer: undefined
  });
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
 * @param {Object} config - Configuración del menú
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
  copyCode,
  handleCopyButton,
  interactiveButtons,
  createTodoList,
  addTodoItem,
  markTodoItem,
  unmarkTodoItem,
  deleteTodoItem,
  categorizedMenu,
  helpByCategory,
  createExpandableMenu,
  createCodeMessage,
  createLoadingMessage,
  createPaginatedMenu,
  formatTable,
  createProgressMessage
}

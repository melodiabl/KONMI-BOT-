import logger from '../config/logger.js'

const codeStorage = new Map()

export function sendCopyableCode(code, description = '') {
  return {
    text: `${description ? description + '\n\n' : ''}📋 *CÓDIGO COPIABLE*\n\n\`\`\`\n${code}\n\`\`\`\n\n💡 _Selecciona y copia el código de arriba_`,
  }
}

export function sendInteractiveButtons(title, buttons) {
  return {
    text: title,
    footer: 'KONMI BOT',
    templateButtons: buttons.map((btn, idx) => ({
      buttonId: btn.command || btn.id || `btn_${idx}`,
      buttonText: { displayText: btn.text || btn.label || `Opción ${idx + 1}` },
      type: 1
    }))
  }
}

export function sendCategorizedList(title, sections) {
  return {
    text: title,
    sections: sections,
    listType: 1
  }
}

export async function copyCode(ctx) {
  const { args, remoteJid, sock, sender } = ctx

  if (args.length === 0) {
    return {
      success: false,
      message: '❌ Uso: /copy [código]\n\nEjemplo: /copy npm install axios'
    }
  }

  const code = args.join(' ')
  const codeId = `${sender}_${Date.now()}`

  codeStorage.set(codeId, code)

  try {
    // Send interactive message with copy button for mobile
    const buttons = [
      {
        buttonId: `copy_${codeId}`,
        buttonText: { displayText: '📋 Copiar al Portapapeles' },
        type: 1
      }
    ]

    await sock.sendMessage(remoteJid, {
      text: `📋 *CÓDIGO PARA COPIAR*\n\n\`\`\`\n${code}\n\`\`\`\n\n💡 _Presiona el botón abajo para copiar fácilmente_\n\n✨ El código se mantendrá disponible por 1 hora.`,
      footer: 'KONMI BOT',
      templateButtons: buttons
    })

    return { success: true, message: `✅ Código listo para copiar` }
  } catch (error) {
    logger.error('Error enviando código:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

export async function handleCopyButton(ctx) {
  const { args, remoteJid, sock, sender } = ctx

  if (args.length === 0) {
    return { success: false, message: '❌ ID de código no proporcionado' }
  }

  const codeId = args[0].replace('copy_', '')
  const code = codeStorage.get(codeId)

  if (!code) {
    return { success: false, message: '❌ Código expirado o no encontrado' }
  }

  try {
    // Send the code in a format that's easy to copy on mobile
    await sock.sendMessage(remoteJid, {
      text: `📋 *CÓDIGO COPIADO*\n\n\`\`\`\n${code}\n\`\`\`\n\n✅ _Ahora puedes seleccionar y copiar el código fácilmente_`,
      contextInfo: {
        stanzaId: codeId,
        externalAdReply: {
          title: '📋 Código Copiado',
          body: code.substring(0, 50) + (code.length > 50 ? '...' : ''),
          previewType: 'PHOTO'
        }
      }
    })

    return { success: true, message: '✅ Código enviado para copiar' }
  } catch (error) {
    logger.error('Error manejando botón de copia:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

export async function interactiveButtons(ctx) {
  const { args, remoteJid, sock, quoted } = ctx

  if (args.length < 2) {
    return { 
      success: false, 
      message: '❌ Uso: /buttons [título] [botón1:comando1] [botón2:comando2] ...\n\nEjemplo: /buttons Menú "Ver Perfil:/profile" "Ayuda:/help"' 
    }
  }

  const title = args[0]
  const buttons = args.slice(1).map((btn, idx) => {
    const [text, command] = btn.split(':')
    return {
      buttonId: command || `btn_${idx}`,
      buttonText: { displayText: text || `Opción ${idx + 1}` },
      type: 1
    }
  })

  try {
    await sock.sendMessage(remoteJid, {
      text: title,
      footer: 'KONMI BOT',
      templateButtons: buttons,
      image: null
    }, { quoted })

    return { success: true, message: '✅ Botones enviados' }
  } catch (error) {
    logger.error('Error enviando botones:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

export async function createTodoList(ctx) {
  const { args, remoteJid, sock, sender } = ctx

  if (args.length === 0) {
    return { 
      success: false, 
      message: '❌ Uso: /todo [nombre] [item1] [item2] ...\n\nEjemplo: /todo "Mi Lista" "Tarea 1" "Tarea 2" "Tarea 3"' 
    }
  }

  const listName = args[0]
  const items = args.slice(1)

  if (items.length === 0) {
    return { 
      success: false, 
      message: '❌ Debes agregar al menos 1 ítem a la lista' 
    }
  }

  const listId = `todo_${sender}_${Date.now()}`
  const todoList = {
    id: listId,
    name: listName,
    items: items.map((item, idx) => ({
      id: `item_${idx}`,
      text: item,
      completed: false,
      index: idx + 1
    })),
    createdAt: new Date(),
    updatedAt: new Date()
  }

  codeStorage.set(listId, todoList)

  let todoText = `✅ *${listName}*\n\n`
  todoList.items.forEach((item, idx) => {
    todoText += `☐ \`${idx + 1}. ${item.text}\`\n`
  })
  todoText += `\n📌 Total: ${items.length} tareas\n💡 Usa /todo-mark [lista] [número] para marcar una tarea completada`

  try {
    const sections = [
      {
        title: '📋 Opciones',
        rows: [
          { title: '✅ Marcar Completada', description: 'Marca un ítem como hecho', rowId: `/todo-mark ${listId}` },
          { title: '❌ Desmarcar', description: 'Desmarca un ítem completado', rowId: `/todo-unmark ${listId}` },
          { title: '🗑️ Eliminar Ítem', description: 'Borra un ítem de la lista', rowId: `/todo-delete ${listId}` },
          { title: '➕ Agregar Ítem', description: 'Añade un nuevo ítem', rowId: `/todo-add ${listId}` },
        ]
      }
    ]

    await sock.sendMessage(remoteJid, {
      text: todoText,
      sections: sections
    })

    return { success: true, message: `✅ Lista de tareas creada: ${listName}` }
  } catch (error) {
    logger.error('Error creando lista de tareas:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

export async function markTodoItem(ctx) {
  const { args, remoteJid, sock, sender } = ctx

  if (args.length < 2) {
    return { 
      success: false, 
      message: '❌ Uso: /todo-mark [lista-id] [número-item]' 
    }
  }

  const [listId, itemNum] = args
  const todoList = codeStorage.get(listId)

  if (!todoList || !todoList.items) {
    return { 
      success: false, 
      message: '❌ Lista no encontrada o expirada' 
    }
  }

  const idx = parseInt(itemNum) - 1
  if (idx < 0 || idx >= todoList.items.length) {
    return { 
      success: false, 
      message: `❌ Ítem inválido (1-${todoList.items.length})` 
    }
  }

  todoList.items[idx].completed = true
  todoList.updatedAt = new Date()

  let todoText = `✅ *${todoList.name}*\n\n`
  let completedCount = 0
  todoList.items.forEach((item) => {
    const checkbox = item.completed ? '☑️' : '☐'
    todoText += `${checkbox} \`${item.index}. ${item.text}\`\n`
    if (item.completed) completedCount++
  })
  todoText += `\n📊 Completadas: ${completedCount}/${todoList.items.length}`

  try {
    await sock.sendMessage(remoteJid, { text: todoText })
    return { success: true, message: `✅ Ítem marcado como completado` }
  } catch (error) {
    logger.error('Error marcando ítem:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

export async function unmarkTodoItem(ctx) {
  const { args, remoteJid, sock } = ctx

  if (args.length < 2) {
    return { 
      success: false, 
      message: '❌ Uso: /todo-unmark [lista-id] [número-item]' 
    }
  }

  const [listId, itemNum] = args
  const todoList = codeStorage.get(listId)

  if (!todoList || !todoList.items) {
    return { 
      success: false, 
      message: '❌ Lista no encontrada o expirada' 
    }
  }

  const idx = parseInt(itemNum) - 1
  if (idx < 0 || idx >= todoList.items.length) {
    return { 
      success: false, 
      message: `❌ Ítem inválido (1-${todoList.items.length})` 
    }
  }

  todoList.items[idx].completed = false
  todoList.updatedAt = new Date()

  let todoText = `✅ *${todoList.name}*\n\n`
  let completedCount = 0
  todoList.items.forEach((item) => {
    const checkbox = item.completed ? '☑️' : '☐'
    todoText += `${checkbox} \`${item.index}. ${item.text}\`\n`
    if (item.completed) completedCount++
  })
  todoText += `\n📊 Completadas: ${completedCount}/${todoList.items.length}`

  try {
    await sock.sendMessage(remoteJid, { text: todoText })
    return { success: true, message: `✅ Ítem desmarcado` }
  } catch (error) {
    logger.error('Error desmarcando ítem:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

export async function deleteTodoItem(ctx) {
  const { args, remoteJid, sock } = ctx

  if (args.length < 2) {
    return { 
      success: false, 
      message: '❌ Uso: /todo-delete [lista-id] [número-item]' 
    }
  }

  const [listId, itemNum] = args
  const todoList = codeStorage.get(listId)

  if (!todoList || !todoList.items) {
    return { 
      success: false, 
      message: '❌ Lista no encontrada o expirada' 
    }
  }

  const idx = parseInt(itemNum) - 1
  if (idx < 0 || idx >= todoList.items.length) {
    return { 
      success: false, 
      message: `❌ Ítem inválido (1-${todoList.items.length})` 
    }
  }

  const deletedItem = todoList.items.splice(idx, 1)[0]
  todoList.items.forEach((item, i) => { item.index = i + 1 })
  todoList.updatedAt = new Date()

  let todoText = `✅ *${todoList.name}*\n\n`
  if (todoList.items.length === 0) {
    todoText = `✅ *${todoList.name}*\n\n📭 _Lista vacía_`
  } else {
    let completedCount = 0
    todoList.items.forEach((item) => {
      const checkbox = item.completed ? '☑️' : '☐'
      todoText += `${checkbox} \`${item.index}. ${item.text}\`\n`
      if (item.completed) completedCount++
    })
    todoText += `\n📊 Completadas: ${completedCount}/${todoList.items.length}`
  }

  try {
    await sock.sendMessage(remoteJid, { text: `✅ Eliminado: "${deletedItem.text}"\n\n${todoText}` })
    return { success: true, message: `✅ Ítem eliminado` }
  } catch (error) {
    logger.error('Error eliminando ítem:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

export async function addTodoItem(ctx) {
  const { args, remoteJid, sock } = ctx

  if (args.length < 2) {
    return { 
      success: false, 
      message: '❌ Uso: /todo-add [lista-id] [nuevo-ítem]' 
    }
  }

  const [listId, ...itemParts] = args
  const newItem = itemParts.join(' ')
  const todoList = codeStorage.get(listId)

  if (!todoList || !todoList.items) {
    return { 
      success: false, 
      message: '❌ Lista no encontrada o expirada' 
    }
  }

  todoList.items.push({
    id: `item_${todoList.items.length}`,
    text: newItem,
    completed: false,
    index: todoList.items.length + 1
  })
  todoList.updatedAt = new Date()

  let todoText = `✅ *${todoList.name}*\n\n`
  let completedCount = 0
  todoList.items.forEach((item) => {
    const checkbox = item.completed ? '☑️' : '☐'
    todoText += `${checkbox} \`${item.index}. ${item.text}\`\n`
    if (item.completed) completedCount++
  })
  todoText += `\n📊 Completadas: ${completedCount}/${todoList.items.length}`

  try {
    await sock.sendMessage(remoteJid, { text: `➕ Nuevo ítem agregado\n\n${todoText}` })
    return { success: true, message: `✅ Ítem agregado a la lista` }
  } catch (error) {
    logger.error('Error agregando ítem:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

export async function categorizedMenu(ctx) {
  const { remoteJid, sock, isOwner } = ctx

  const sections = [
    {
      title: '🎯 Inicio',
      rows: [
        { title: '🏠 Menú Principal', description: 'Vuelve al menú de inicio', rowId: '/menu' },
        { title: '❓ Ayuda', description: 'Obtén ayuda sobre los comandos', rowId: '/help' },
      ]
    },
    {
      title: '📥 Descargas',
      rows: [
        { title: '▶️ Descargar Video', description: 'Descarga videos de YouTube, TikTok, etc.', rowId: '/video' },
        { title: '🎵 Descargar Música', description: 'Descarga canciones en alta calidad', rowId: '/music' },
        { title: '🎬 Descargar Audio', description: 'Descarga audio de videos', rowId: '/audio' },
      ]
    },
    {
      title: '🤖 Sub-bots',
      rows: [
        { title: '🔗 Generar Código', description: 'Crea un código para conectar sub-bot', rowId: '/code' },
        { title: '📱 QR Emparejamiento', description: 'Genera QR para emparejar', rowId: '/qr' },
        { title: '👁️ Ver Mis Bots', description: 'Administra tus sub-bots', rowId: '/mybots' },
      ]
    },
    {
      title: '🛠️ Utilidades',
      rows: [
        { title: '📊 Estado del Sistema', description: 'Información del servidor', rowId: '/status' },
        { title: '⚡ Ping', description: 'Mide la latencia', rowId: '/ping' },
        { title: '🎨 Crear Sticker', description: 'Convierte imágenes en stickers', rowId: '/sticker' },
      ]
    }
  ]

  if (isOwner) {
    sections.push({
      title: '👑 Administración',
      rows: [
        { title: '⚙️ Panel Admin', description: 'Acceso a funciones de owner', rowId: '/admin' },
        { title: '📣 Anuncio Global', description: 'Envía mensajes a todos', rowId: '/broadcast' },
        { title: '📋 Ver Todos los Bots', description: 'Lista de todos los sub-bots', rowId: '/bots' },
      ]
    })
  }

  try {
    await sock.sendMessage(remoteJid, {
      text: '📱 *MENÚ POR CATEGORÍAS*\n\n_Selecciona una opción para continuar_',
      sections: sections,
      listType: 1
    })

    return { success: true, message: '✅ Menú categorizado enviado' }
  } catch (error) {
    logger.error('Error enviando menú categorizado:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

export async function helpByCategory(ctx) {
  const { remoteJid, sock, isOwner } = ctx

  const categories = {
    '📥 Descargas': [
      { cmd: '/video [url]', desc: 'Descarga videos de YouTube, TikTok, Instagram, etc.' },
      { cmd: '/music [url]', desc: 'Descarga música en MP3' },
      { cmd: '/audio [url]', desc: 'Extrae audio de videos' },
    ],
    '🤖 Sub-bots': [
      { cmd: '/code', desc: 'Genera código de emparejamiento' },
      { cmd: '/qr', desc: 'Muestra QR para emparejar' },
      { cmd: '/mybots', desc: 'Lista tus sub-bots activos' },
    ],
    '🛠️ Utilidades': [
      { cmd: '/status', desc: 'Estado del bot y sistema' },
      { cmd: '/ping', desc: 'Latencia del bot' },
      { cmd: '/sticker [responde imagen]', desc: 'Crea sticker' },
    ],
    '🎨 Interactivos': [
      { cmd: '/poll "pregunta" "opción1" "opción2"', desc: 'Crea encuesta' },
      { cmd: '/todo "nombre" "tarea1" "tarea2"', desc: 'Crea lista de tareas' },
      { cmd: '/buttons "título" "btn1:cmd" "btn2:cmd"', desc: 'Botones personalizados' },
    ]
  }

  if (isOwner) {
    categories['👑 Administración'] = [
      { cmd: '/admin', desc: 'Panel de administración' },
      { cmd: '/broadcast [mensaje]', desc: 'Anuncia a todos los usuarios' },
      { cmd: '/bots', desc: 'Ver todos los sub-bots' },
    ]
  }

  let helpText = `📖 *AYUDA POR CATEGORÍA*\n\n`
  
  for (const [category, commands] of Object.entries(categories)) {
    helpText += `${category}\n`
    commands.forEach(cmd => {
      helpText += `  • \`${cmd.cmd}\`\n    ${cmd.desc}\n`
    })
    helpText += '\n'
  }

  const sections = Object.entries(categories).map(([category, commands]) => ({
    title: category,
    rows: commands.map((cmd, idx) => ({
      title: cmd.cmd.split(' ')[0],
      description: cmd.desc.substring(0, 60),
      rowId: cmd.cmd.split(' ')[0]
    }))
  }))

  try {
    await sock.sendMessage(remoteJid, {
      text: helpText,
      sections: sections,
      listType: 1
    })

    return { success: true, message: '✅ Ayuda por categoría enviada' }
  } catch (error) {
    logger.error('Error enviando ayuda categorizada:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

export default {
  copyCode,
  handleCopyButton,
  interactiveButtons,
  createTodoList,
  markTodoItem,
  unmarkTodoItem,
  deleteTodoItem,
  addTodoItem,
  categorizedMenu,
  helpByCategory
}

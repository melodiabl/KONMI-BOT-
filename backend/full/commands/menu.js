// commands/menu.js
// Menú interactivo refactorizado para usar los tipos de mensaje nativos de @itsukichan/baileys

export async function menu(ctx) {
  // El objeto ctx ya contiene información útil como el nombre del usuario y si es owner/admin
  const userTag = `@${ctx.sender.split('@')[0]}`
  const header = `🤖 *KONMI BOT*`
  const body = `¡Hola, ${userTag}! 👋\n\nSoy Konmi Bot, tu asistente de WhatsApp. Elige una de las siguientes opciones para empezar.`
  const footer = 'Konmi Bot v3.0 | Desarrollado con @itsukichan/baileys'

  // Construimos un Buttons Message, que es más simple y compatible.
  const buttons = [
    { buttonId: '/help', buttonText: { displayText: '📋 Ver Comandos' }, type: 1 },
    { buttonId: '/mybots', buttonText: { displayText: '🤖 Mis Sub-bots' }, type: 1 },
  ]

  // Si el usuario es el propietario (owner), añadimos el botón de Admin.
  if (ctx.isOwner) {
    buttons.push({ buttonId: '/admin', buttonText: { displayText: '👑 Menú de Administrador' }, type: 1 })
  }

  return {
    type: 'buttons', // Un nuevo tipo que el handler deberá procesar
    text: `${header}\n\n${body}`,
    footer: footer,
    buttons: buttons,
    headerType: 1
  }
}

export async function help(ctx) {
  // Refactorizamos para usar el formato nativo de List Message del fork
  const sections = [
    {
      title: '🤖 Gestión de Sub-bots',
      rows: [
        { title: 'Generar Código de Emparejamiento', description: 'Conecta un nuevo sub-bot usando un código.', rowId: '/code' },
        { title: 'Generar Código QR', description: 'Alternativa a código para conectar un sub-bot.', rowId: '/qr' },
        { title: 'Ver mis Sub-bots', description: 'Administra tus sub-bots activos.', rowId: '/mybots' },
      ],
    },
    {
      title: '📥 Comandos de Descarga',
      rows: [
        { title: 'Descargar Video', description: 'Baja un video de YouTube o TikTok. Uso: /video <url>', rowId: '/video' },
        { title: 'Descargar Música', description: 'Baja una canción en alta calidad. Uso: /music <url>', rowId: '/music' },
        { title: 'Crear Sticker', description: 'Crea un sticker desde una imagen.', rowId: '/sticker' },
      ],
    },
    {
      title: '🛠️ Utilidades y Sistema',
      rows: [
        { title: 'Estado del Sistema', description: 'Muestra información del servidor y del bot.', rowId: '/status' },
        { title: 'Ping', description: 'Mide la latencia del bot.', rowId: '/ping' },
      ],
    },
  ]

  // Si el usuario es owner, se añade la sección de administración
  if (ctx.isOwner) {
    sections.push({
      title: '👑 Comandos de Administrador',
      rows: [
        { title: 'Panel de Administración', description: 'Accede a las funciones de owner.', rowId: '/admin' },
        { title: 'Ver todos los Bots', description: 'Lista todos los sub-bots del sistema.', rowId: '/bots' },
        { title: 'Realizar Anuncio Global', description: 'Envía un mensaje a todos los usuarios.', rowId: '/broadcast' },
      ]
    })
  }

  return {
    type: 'list', // El handler ya debería saber cómo manejar esto
    text: 'Aquí tienes la lista de comandos disponibles. Selecciona una opción para ejecutarla.',
    title: '📋 Menú de Comandos',
    buttonText: 'Elige un comando',
    footer: 'Konmi Bot v3.0',
    sections,
  }
}

export default { menu, help }

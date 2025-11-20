// commands/admin-menu.js
import { sendInteractiveButtons, sendCategorizedList } from './ui-interactive.js'

export async function adminMenu(ctx) {
  const sections = [
    {
      title: '🤖 Gestión de Bots',
      rows: [
        { title: '👁️ Ver Todos los Bots', description: 'Lista completa de sub-bots', rowId: '/bots' },
        { title: '📱 Mis Sub-bots', description: 'Administrar mis bots conectados', rowId: '/mybots' },
        { title: '⚙️ Control del Bot', description: 'Encender/apagar bot en grupos', rowId: '/bot' },
        { title: '📣 Broadcast Global', description: 'Enviar mensaje a todos', rowId: '/broadcast' },
      ],
    },
    {
      title: '👑 Configuración de Owner',
      rows: [
        { title: '🔧 Cambiar Owner', description: 'Configurar nuevo owner principal', rowId: '/setowner' },
        { title: '👤 Info de Owner', description: 'Ver información del owner', rowId: '/ownerinfo' },
        { title: '🔍 Debug del Bot', description: 'Información técnica del bot', rowId: '/debug' },
      ],
    },
    {
      title: '🛠️ Sistema Avanzado',
      rows: [
        { title: '🧹 Limpiar Cache', description: 'Limpiar caché del sistema', rowId: '/clearcache' },
        { title: '📊 Estadísticas', description: 'Estadísticas de rendimiento', rowId: '/stats' },
        { title: '🔄 Reiniciar', description: 'Reiniciar el bot', rowId: '/restart' },
        { title: '🛑 Detener', description: 'Detener el bot', rowId: '/stop' },
      ],
    },
  ]

  return sendCategorizedList('🛡️ *PANEL DE ADMINISTRACIÓN COMPLETO*\n\nSelecciona una categoría para ver todas las opciones disponibles:', sections)
}

export default { adminMenu }


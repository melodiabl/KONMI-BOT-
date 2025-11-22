# 📚 Ejemplos de Cómo Actualizar Comandos con UI Interactiva

## Guía Práctica para Integrar UI en Comandos Existentes

---

## Ejemplo 1: Convertir `/status` a Botones

### Antes (Texto Plano):
```javascript
// commands/system-info.js
export async function status() {
  let msg = '📊 Estado del Bot\n\n'
  msg += `Conexión: Conectado\n`
  msg += `Uptime: 3600s\n`
  msg += `Memoria: RSS 512MB, Heap 256MB\n`
  return { success: true, message: msg }
}
```

### Después (Con Botones):
```javascript
// commands/system-info.js
import { sendInteractiveButtons } from './ui-interactive.js'

export async function status(ctx) {
  const buttons = [
    { text: '🔄 Reiniciar', command: '/restart' },
    { text: '📊 Detalles', command: '/system' },
    { text: '🏠 Menú', command: '/menu' },
  ]
  
  let msg = `📊 *ESTADO DEL BOT*\n\n`
  msg += `✅ Conexión: Conectada\n`
  msg += `⏱️ Uptime: 3600s\n`
  msg += `💾 Memoria: RSS 512MB, Heap 256MB\n`
  
  return sendInteractiveButtons(msg, buttons)
}
```

---

## Ejemplo 2: Convertir `/groups` a Listas Categorizadas

### Antes (Texto Plano):
```javascript
// commands/groups.js
export async function listGroups(ctx) {
  const { sock } = ctx
  const groups = await sock.groupFetchAllParticipating()
  
  let msg = '📋 Mis Grupos:\n\n'
  Object.values(groups).forEach((group, idx) => {
    msg += `${idx + 1}. ${group.subject}\n`
  })
  
  return { success: true, message: msg }
}
```

### Después (Con Listas):
```javascript
// commands/groups.js
import { sendCategorizedList } from './ui-interactive.js'

export async function listGroups(ctx) {
  const { sock } = ctx
  const groups = await sock.groupFetchAllParticipating()
  
  const sections = []
  const activeGroups = Object.values(groups).slice(0, 10) // Máximo 10
  
  sections.push({
    title: '👥 Grupos Activos',
    rows: activeGroups.map((group, idx) => ({
      title: group.subject || `Grupo ${idx + 1}`,
      description: `${group.participants?.length || 0} miembros`,
      rowId: `/groupinfo ${group.id}`
    }))
  })
  
  return sendCategorizedList('📋 *MIS GRUPOS*\n\nSelecciona un grupo para ver detalles', sections)
}
```

---

## Ejemplo 3: Convertir `/mybots` a Interfaz Completa

### Antes (Texto Plano):
```javascript
// commands/subbots.js
export async function myBots(ctx) {
  const bots = await getBots(ctx.sender)
  
  let msg = '🤖 Mis Sub-bots:\n\n'
  bots.forEach((bot, idx) => {
    msg += `${idx + 1}. ${bot.name} - ${bot.status}\n`
  })
  
  return { success: true, message: msg }
}
```

### Después (Con Listas y Botones):
```javascript
// commands/subbots.js
import { sendCategorizedList } from './ui-interactive.js'

export async function myBots(ctx) {
  const bots = await getBots(ctx.sender)
  
  const sections = [
    {
      title: '🟢 Activos',
      rows: bots
        .filter(b => b.status === 'active')
        .map(bot => ({
          title: `🤖 ${bot.name}`,
          description: `${bot.number} - Conectado`,
          rowId: `/botinfo ${bot.id}`
        }))
    },
    {
      title: '🔴 Inactivos',
      rows: bots
        .filter(b => b.status !== 'active')
        .map(bot => ({
          title: `🤖 ${bot.name}`,
          description: `${bot.number} - Desconectado`,
          rowId: `/botinfo ${bot.id}`
        }))
    }
  ]
  
  return sendCategorizedList('🤖 *MIS SUB-BOTS*\n\nSelecciona un bot para detalles', sections)
}
```

---

## Ejemplo 4: Convertir `/install` a Código Copiable

### Antes (Texto Plano):
```javascript
// commands/download-commands.js
export async function install(ctx) {
  const cmd = 'npm install && npm run dev'
  return { success: true, message: `Para iniciar:\n\n${cmd}` }
}
```

### Después (Con Código Copiable):
```javascript
// commands/download-commands.js
import { sendCopyableCode } from './ui-interactive.js'

export async function install(ctx) {
  return sendCopyableCode(
    'npm install && npm run dev',
    '📝 *INSTRUCCIONES DE INSTALACIÓN*\n\n1. Clona el repositorio\n2. Ejecuta este comando:\n'
  )
}
```

---

## Ejemplo 5: Sistema Completo con Todos los Helpers

### Comando Completo con Multiple Tipos de UI:

```javascript
// commands/showcase.js
import { 
  sendCopyableCode, 
  sendInteractiveButtons, 
  sendCategorizedList 
} from './ui-interactive.js'

export async function showcase(ctx) {
  const { args } = ctx
  
  if (!args[0]) {
    // Menú principal con botones
    const buttons = [
      { text: '📋 Ver Opciones', command: '/showcase options' },
      { text: '📝 Ver Código', command: '/showcase code' },
      { text: '🎯 Categorías', command: '/showcase categories' },
    ]
    return sendInteractiveButtons('🎪 *DEMOSTRACIÓN DE UI*', buttons)
  }
  
  if (args[0] === 'options') {
    // Mostrar con botones
    const buttons = [
      { text: '✅ Opción 1', command: '/cmd1' },
      { text: '❌ Opción 2', command: '/cmd2' },
      { text: '❓ Opción 3', command: '/cmd3' },
    ]
    return sendInteractiveButtons('🎯 *SELECCIONA UNA OPCIÓN*', buttons)
  }
  
  if (args[0] === 'code') {
    // Mostrar código copiable
    return sendCopyableCode(
      'console.log("Hola Mundo")',
      '💻 *CÓDIGO DE EJEMPLO*\n\nCopia y pega este código:'
    )
  }
  
  if (args[0] === 'categories') {
    // Mostrar con listas categorizadas
    const sections = [
      {
        title: '🎨 Estilos',
        rows: [
          { title: 'Tema Oscuro', description: 'Interfaz negra', rowId: '/style dark' },
          { title: 'Tema Claro', description: 'Interfaz blanca', rowId: '/style light' },
        ]
      },
      {
        title: '⚙️ Configuración',
        rows: [
          { title: 'Sonido', description: 'Habilitar/Deshabilitar', rowId: '/config sound' },
          { title: 'Notificaciones', description: 'Gestionar notificaciones', rowId: '/config notify' },
        ]
      }
    ]
    return sendCategorizedList('📋 *CATEGORÍAS*\n\nSelecciona una sección', sections)
  }
}
```

---

## Ejemplo 6: Validación y Manejo de Errores

### Con Manejo Completo:

```javascript
import { sendInteractiveButtons, sendCopyableCode } from './ui-interactive.js'
import logger from '../config/logger.js'

export async function comandoSeguro(ctx) {
  try {
    const { args } = ctx
    
    // Validar entrada
    if (!args || args.length === 0) {
      const buttons = [
        { text: '📖 Ayuda', command: '/help' },
        { text: '🏠 Menú', command: '/menu' },
      ]
      return sendInteractiveButtons('ℹ️ Proporciona argumentos', buttons)
    }
    
    // Procesar
    const resultado = procesarDatos(args)
    
    // Si el resultado incluye código
    if (resultado.code) {
      return sendCopyableCode(resultado.code, resultado.description)
    }
    
    // Si el resultado incluye opciones
    if (resultado.options) {
      const buttons = resultado.options.map(opt => ({
        text: opt.label,
        command: opt.command
      }))
      return sendInteractiveButtons(resultado.title, buttons)
    }
    
    return { success: true, message: resultado.message }
    
  } catch (error) {
    logger.error('Error en comandoSeguro:', error)
    
    const buttons = [
      { text: '🔄 Reintentar', command: '/help' },
      { text: '📞 Contactar Soporte', command: '/support' },
    ]
    return sendInteractiveButtons(`❌ Error: ${error.message}`, buttons)
  }
}
```

---

## Ejemplo 7: Integración con Autenticación

### Comando que Verifica Permisos:

```javascript
import { sendInteractiveButtons } from './ui-interactive.js'

export async function comandoAdmin(ctx) {
  // Verificar permisos
  if (!ctx.isOwner) {
    const buttons = [
      { text: '📞 Contactar Owner', command: '/contact' },
      { text: '🏠 Menú', command: '/menu' },
    ]
    return sendInteractiveButtons('⛔ *SOLO PARA OWNER*\n\nNo tienes permiso', buttons)
  }
  
  // Si tiene permisos, mostrar opciones
  const buttons = [
    { text: '👥 Gestionar Usuarios', command: '/admin users' },
    { text: '⚙️ Configuración', command: '/admin config' },
    { text: '🔐 Seguridad', command: '/admin security' },
  ]
  
  return sendInteractiveButtons('🛡️ *PANEL ADMIN*\n\nSelecciona una opción', buttons)
}
```

---

## Patrón de Migración

### Paso 1: Importar
```javascript
import { sendInteractiveButtons, sendCopyableCode, sendCategorizedList } from './ui-interactive.js'
```

### Paso 2: Reemplazar el Return
```javascript
// Antes
return { success: true, message: 'texto largo aquí' }

// Después
return sendInteractiveButtons('titulo', buttons)
// O
return sendCopyableCode('codigo', 'descripcion')
// O
return sendCategorizedList('titulo', sections)
```

### Paso 3: Ajustar Datos
```javascript
// Transformar datos a formato de botones/listas
const buttons = opciones.map(opt => ({
  text: opt.label,
  command: opt.comando
}))
```

---

## ✅ Checklist de Implementación

- [ ] Importar las funciones helper necesarias
- [ ] Estructurar los datos (botones, secciones, etc.)
- [ ] Reemplazar el return con la función helper
- [ ] Verificar que el texto es descriptivo
- [ ] Probar en WhatsApp
- [ ] Verificar fallback a texto plano
- [ ] Documentar el cambio

---

## 🚀 Comandos Candidatos para Actualización

Estos comandos se beneficiarían de UI interactiva:

| Comando | Tipo | Beneficio |
|---------|------|-----------|
| `/status` | Botones | Acciones rápidas |
| `/groups` | Listas | Selección fácil |
| `/mybots` | Listas | Gestión mejorada |
| `/admin` | Botones | Interfaz clara |
| `/help` | Listas | ✅ Ya actualizado |
| `/menu` | Botones | ✅ Ya actualizado |
| `/broadcast` | Botones | Control de diffusión |
| `/settings` | Listas | Configuración organizada |
| `/members` | Listas | Lista de miembros |
| `/role` | Botones | Asignación de roles |

---

## 📞 Soporte

- **Preguntas:** Revisa `UI_INTEGRATION_COMPLETE.md`
- **Referencia Rápida:** `UI_INTERACTIVE_QUICKREF.txt`
- **Guía Completa:** `UI_INTERACTIVE_GUIDE.md`

---

**Versión:** 1.0  
**Última Actualización:** 2025-01-19

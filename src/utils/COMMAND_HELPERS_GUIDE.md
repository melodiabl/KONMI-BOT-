# 📚 Guía de Uso - Command Helpers

## 🎯 Introducción

El archivo `command-helpers.js` centraliza todas las utilidades comunes para comandos, proporcionando:
- Validaciones robustas
- Respuestas estandarizadas
- Logging centralizado
- Extracción de información

---

## 📦 Importación

```javascript
import {
  onlyDigits,
  isValidJid,
  isValidPhoneNumber,
  first,
  extractTargetJid,
  checkAdminPermission,
  errorResponse,
  successResponse,
  logCommandExecution,
  logCommandError,
  extractUserInfo,
  formatUserList,
  validateAdminPermission,
} from '../utils/command-helpers.js'
```

---

## 🔧 Funciones Disponibles

### 1. **onlyDigits(v)**
Extrae solo dígitos de una cadena.

```javascript
const numero = onlyDigits('549-1234-5678')
console.log(numero) // "5491234567890"
```

---

### 2. **isValidJid(jid)**
Valida si un JID tiene formato válido.

```javascript
isValidJid('5491234567890@s.whatsapp.net') // true
isValidJid('invalid') // false
isValidJid('123@s.whatsapp.net') // false (menos de 10 dígitos)
```

---

### 3. **isValidPhoneNumber(digits)**
Valida si un número de teléfono es válido (10-15 dígitos).

```javascript
isValidPhoneNumber('5491234567890') // true
isValidPhoneNumber('123') // false (muy corto)
isValidPhoneNumber('12345678901234567890') // false (muy largo)
```

---

### 4. **first(v)**
Extrae el primer elemento de un array.

```javascript
first([1, 2, 3]) // 1
first([]) // null
first('no es array') // null
```

---

### 5. **extractTargetJid(ctx)**
Extrae el JID del usuario objetivo desde el contexto.

```javascript
export async function myCommand(ctx) {
  const targetJid = extractTargetJid(ctx)

  if (!targetJid) {
    return errorResponse('❌ Menciona a un usuario.')
  }

  // Usar targetJid...
}
```

**Busca en este orden:**
1. Menciones en mensaje citado
2. Participante del mensaje citado
3. Argumentos del comando

---

### 6. **checkAdminPermission(ctx)**
Verifica si el usuario tiene permisos de administrador.

```javascript
const hasPermission = await checkAdminPermission(ctx)

if (!hasPermission) {
  return errorResponse('🚫 Solo administradores.')
}
```

---

### 7. **errorResponse(message, metadata)**
Crea una respuesta de error estandarizada.

```javascript
return errorResponse('❌ Error al procesar.', {
  command: 'mycommand',
  reason: 'invalid_input',
  details: 'El número no es válido'
})

// Resultado:
{
  success: false,
  message: '❌ Error al procesar.',
  metadata: {
    timestamp: '2024-01-15T10:30:45.123Z',
    command: 'mycommand',
    reason: 'invalid_input',
    details: 'El número no es válido'
  }
}
```

---

### 8. **successResponse(message, options)**
Crea una respuesta de éxito estandarizada.

```javascript
return successResponse('✅ Operación completada.', {
  mentions: ['5491234567890@s.whatsapp.net'],
  metadata: {
    command: 'mycommand',
    target: '5491234567890',
    result: 'success'
  }
})

// Resultado:
{
  success: true,
  message: '✅ Operación completada.',
  mentions: ['5491234567890@s.whatsapp.net'],
  metadata: {
    timestamp: '2024-01-15T10:30:45.123Z',
    command: 'mycommand',
    target: '5491234567890',
    result: 'success'
  }
}
```

---

### 9. **logCommandExecution(command, ctx, success, details)**
Registra la ejecución de un comando.

```javascript
logCommandExecution('ban', ctx, true, {
  target: '5491234567890',
  reason: 'spam'
})

// Log:
// ✅ Comando ejecutado: /ban | Usuario: 5491234567890 | Contexto: Grupo 123456
```

---

### 10. **logCommandError(command, ctx, error, details)**
Registra un error de comando.

```javascript
try {
  // operación...
} catch (e) {
  logCommandError('ban', ctx, e, {
    stage: 'database_insert',
    target: '5491234567890'
  })
}

// Log:
// ❌ Error en comando /ban: Connection timeout
```

---

### 11. **extractUserInfo(jid)**
Extrae información del usuario desde un JID.

```javascript
const info = extractUserInfo('5491234567890@s.whatsapp.net')

console.log(info)
// {
//   number: '5491234567890',
//   mention: '@5491234567890',
//   jid: '5491234567890@s.whatsapp.net'
// }
```

---

### 12. **formatUserList(users, limit)**
Formatea una lista de usuarios para mostrar.

```javascript
const users = [
  '5491234567890@s.whatsapp.net',
  '5491234567891@s.whatsapp.net',
  '5491234567892@s.whatsapp.net'
]

const formatted = formatUserList(users, 20)

// Resultado:
// 1. @5491234567890
// 2. @5491234567891
// 3. @5491234567892
```

---

### 13. **validateAdminPermission(ctx, commandName)**
Valida permisos de administrador con logging automático.

```javascript
export async function myCommand(ctx) {
  const permCheck = await validateAdminPermission(ctx, 'mycommand')

  if (!permCheck.allowed) {
    return permCheck.response // Ya tiene logging y metadata
  }

  // Continuar con la operación...
}
```

---

## 📋 Patrón de Comando Completo

```javascript
import logger from '../config/logger.js'
import {
  extractTargetJid,
  successResponse,
  errorResponse,
  logCommandExecution,
  logCommandError,
  validateAdminPermission,
  extractUserInfo,
} from '../utils/command-helpers.js'

export async function myCommand(ctx) {
  try {
    // 1. Validar permisos
    const permCheck = await validateAdminPermission(ctx, 'mycommand')
    if (!permCheck.allowed) {
      return permCheck.response
    }

    // 2. Extraer información
    const targetJid = extractTargetJid(ctx)
    if (!targetJid) {
      logCommandExecution('mycommand', ctx, false, { reason: 'no_target' })
      return errorResponse('❌ Menciona a un usuario.', {
        command: 'mycommand',
        reason: 'no_target',
      })
    }

    // 3. Procesar
    const targetInfo = extractUserInfo(targetJid)
    const executorInfo = extractUserInfo(ctx.sender)

    // Hacer algo...
    const result = await doSomething(targetJid)

    // 4. Registrar éxito
    logger.info(
      {
        scope: 'command',
        command: 'mycommand',
        target: targetInfo.number,
        executor: executorInfo.number,
        result: result.status,
      },
      `✅ Operación completada: ${targetInfo.mention}`
    )

    logCommandExecution('mycommand', ctx, true, {
      target: targetInfo.number,
      result: result.status,
    })

    // 5. Retornar respuesta
    return successResponse(
      `✅ Operación completada para ${targetInfo.mention}.`,
      {
        mentions: [targetJid],
        metadata: {
          target: targetInfo.number,
          executor: executorInfo.number,
          result: result.status,
        },
      }
    )
  } catch (e) {
    // 6. Registrar error
    logCommandError('mycommand', ctx, e)
    return errorResponse('⚠️ Error al procesar. Intenta de nuevo.', {
      command: 'mycommand',
      error: e.message,
    })
  }
}
```

---

## 🎨 Emojis Recomendados

```javascript
// Éxito
✅ - Operación exitosa
🆙 - Promoción
🔓 - Desbloqueado
📌 - Fijado

// Error
❌ - Error general
🚫 - Permiso denegado
⚠️ - Advertencia
🔒 - Bloqueado

// Información
ℹ️ - Información
📋 - Lista
👑 - Administrador
🛡️ - Admin
🤖 - Bot
📱 - Número
👥 - Miembros

// Acciones
👢 - Expulsión
🔽 - Degradación
⏰ - Tiempo
🧹 - Limpieza
📍 - Ubicación
🔑 - Clave/Owner
```

---

## 🔍 Debugging

### Ver logs en tiempo real
```bash
npm run dev
```

### Logs incluyen:
- Timestamp ISO8601
- Scope (command, database, system, etc.)
- Comando ejecutado
- Usuario que lo ejecutó
- Grupo (si aplica)
- Metadata personalizada
- Mensaje legible

### Ejemplo de log:
```
✅ Comando ejecutado: /ban | Usuario: 5491234567890 | Contexto: Grupo 123456
{
  "scope": "command",
  "command": "ban",
  "user": "5491234567890",
  "group": "120363123456789-1234567890@g.us",
  "isGroup": true,
  "target": "5491234567891",
  "reason": null
}
```

---

## ✨ Mejores Prácticas

1. **Siempre usar helpers centralizados**
   - No duplicar código de validación
   - Mantener consistencia

2. **Registrar todas las operaciones**
   - Usar `logCommandExecution()` para éxito
   - Usar `logCommandError()` para errores

3. **Incluir metadata real**
   - Nunca falsificar datos
   - Usar `extractUserInfo()` para información verificada

4. **Validar entrada**
   - Usar `isValidJid()` para JIDs
   - Usar `isValidPhoneNumber()` para números
   - Usar `validateAdminPermission()` para permisos

5. **Mensajes claros**
   - Usar emojis consistentes
   - Incluir instrucciones de uso
   - Ser específico en errores

---

## 📞 Soporte

Para preguntas o sugerencias sobre los helpers, consulta:
- `src/utils/command-helpers.js` - Código fuente
- `REFACTORING_SUMMARY.md` - Resumen de cambios
- Logs del sistema - Para debugging

---

**Última actualización:** 2024-01-15
**Versión:** 1.0.0

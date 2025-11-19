# Setup Completo de Comandos de Administración y Detección de Admin

## ✅ Cambios Realizados

### 1. **Normalización del Contexto**
Se agregó una función `normalizeContext()` en `commands/registry/index.js` que asegura que todos los comandos reciben un contexto completo con los siguientes campos:
- `usuarioNumber`: Número del usuario que ejecuta el comando
- `usuario`: JID del usuario
- `botNumber`: Número del bot
- `isAdmin`: Boolean indicando si es admin del grupo
- `isBotAdmin`: Boolean indicando si el bot es admin
- `isGroup`: Boolean indicando si es un grupo
- `isOwner`: Boolean indicando si es el owner del bot

### 2. **Actualización de Comandos en `groups.js`**
Los siguientes comandos fueron refactorizados para recibir `ctx` como parámetro completo:
- `kick(ctx)` - Expulsar usuario
- `promote(ctx)` - Promover a admin
- `demote(ctx)` - Degradar de admin
- `lock(ctx)` - Cerrar grupo (solo admins)
- `unlock(ctx)` - Abrir grupo
- `tag(ctx)` - Mencionar usuarios
- `admins(ctx)` - Listar admins
- `addGroup(ctx)` - Registrar grupo
- `delGroup(ctx)` - Desregistrar grupo
- `whoami(ctx)` - Ver tu rol
- `debugadmin(ctx)` - Debug de permisos
- `debuggroup(ctx)` - Info del grupo

### 3. **Actualización de Comandos en `group-extra.js`**
- `tagall(ctx)` - Mencionar a todos
- `groupinfo(ctx)` - Info del grupo

### 4. **Mejora del Debug en `admin.js`**
El comando `/debugbot` ahora muestra:
- Tu número
- Tu estado (admin del grupo o miembro)
- Si el bot es admin en el grupo
- Disponibilidad de metadata del grupo

## 🔍 Detección de Admin

La detección de admin en grupos ocurre en **whatsapp.js:handleMessage()** (líneas 934-943):

```javascript
if (isGroup) {
  try {
    groupMetadata = await s.groupMetadata(remoteJid);
    const participantInfo = (groupMetadata.participants || []).find((p) => p.id === sender);
    isAdmin = !!participantInfo && (participantInfo.admin === 'admin' || participantInfo.admin === 'superadmin');
    const botInfo = (groupMetadata.participants || []).find((p) => p.id === botJid);
    isBotAdmin = !!botInfo && (botInfo.admin === 'admin' || botInfo.admin === 'superadmin');
  } catch (e) {
    logger.error(`Error getting group metadata for ${remoteJid}: ${e.message}`);
  }
}
```

## 📋 Comandos de Administración Disponibles

### Gestión de Miembros
- `/kick` - Expulsar un miembro (requiere admin + bot admin)
- `/promote` - Ascender a admin (requiere admin + bot admin)
- `/demote` - Degradar de admin (requiere admin + bot admin)

### Configuración del Grupo
- `/lock` - Solo admins pueden hablar (requiere admin + bot admin)
- `/unlock` - Todos pueden hablar (requiere admin + bot admin)
- `/subject [texto]` - Cambiar nombre del grupo (requiere admin + bot admin)
- `/desc [texto]` - Cambiar descripción (requiere admin + bot admin)
- `/invite` - Obtener enlace de invitación (requiere admin + bot admin)
- `/muteall` - Silenciar a todos (requiere admin + bot admin)
- `/lockinfo` - Restringir edición de info (requiere admin + bot admin)

### Información
- `/admins` - Listar administradores
- `/tag` - Mencionar usuarios (requiere admin)
- `/tagall` o `/all` - Mencionar a todos
- `/groupinfo` - Info completa del grupo
- `/whoami` - Tu rol en el grupo
- `/debugadmin` - Diagnóstico de permisos
- `/debuggroup` - Info técnica del grupo

### Configuración Avanzada
- `/antilink` - Activar protección contra links
- `/slowmode [segundos]` - Limitar velocidad de mensajes
- `/antiflood` - Protección contra spam
- `/welcome` - Mensaje de bienvenida automático
- `/setwelcome [texto]` - Personalizar bienvenida
- `/rules` - Ver reglas del grupo
- `/setrules [texto]` - Establecer reglas

## 🧪 Cómo Verificar que Funciona

### 1. **Test Básico de Detección de Admin**
Ejecuta desde un admin del grupo:
```
/whoami
```
Debería mostrar: `🛡️ Admin: sí`

### 2. **Test de Bot Admin**
```
/debugadmin
```
Debería mostrar:
- `isAdmin: true` (si eres admin)
- `isBotAdmin: true` (si el bot es admin)

### 3. **Test de Comando Restringido**
Como admin:
```
/admins
```
Debería listar los administradores del grupo.

Como miembro (no admin):
```
/kick @usuario
```
Debería mostrar: `⛔ No tienes permisos de administrador para hacer esto.`

### 4. **Test del Debug del Bot**
```
/debugbot
```
Debería mostrar:
- Tu número
- Tu estatus (admin o miembro)
- Estado del bot en el grupo

## 🔧 Requisitos para Funcionamiento

1. **Bot debe ser Admin**: Muchos comandos requieren que el bot sea administrador del grupo
2. **Usuario debe ser Admin**: Los comandos de administración requieren que el usuario sea admin del grupo
3. **Metadata disponible**: El bot necesita acceso a la metadata del grupo para verificar permisos

## 📝 Notas Importantes

- Todos los comandos ahora reciben el contexto `ctx` normalizado
- La detección de admin es en tiempo real (se verifica cada vez que llega un comando)
- Los campos `isAdmin` e `isBotAdmin` se establecen en `false` para chats privados
- Los mensajes de error proporcionan feedback claro sobre por qué no se puede ejecutar un comando

## 🚀 Próximos Pasos

1. Reinicia el bot para asegurar que los cambios se carguen correctamente
2. Prueba los comandos en un grupo donde seas admin
3. Verifica que el bot haya sido promovido a admin en el grupo
4. Usa `/debugadmin` para diagnosticar problemas de permisos

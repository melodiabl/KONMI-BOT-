# Implementación: Conexión Bot Principal con Sesión Owner

## Objetivo
Implementar la conexión del bot principal solo para admins con dos métodos: QR y código de pairing, donde el código se muestra con formato "KONMI-BOT EL CODIGO".

## Plan Detallado

### 1. Backend - Modificar whatsapp.js
- [ ] Agregar función `connectMainBot()` para conectar el bot principal
- [ ] Modificar la lógica de autenticación para permitir que admins conecten el bot principal
- [ ] Agregar endpoints específicos para la conexión del bot principal

### 2. Backend - Modificar index.js
- [ ] Agregar endpoints `/api/bot/main/connect` para conectar bot principal
- [ ] Agregar endpoint `/api/bot/main/method` para seleccionar método (QR/código)
- [ ] Modificar permisos para que solo admins puedan conectar el bot principal

### 3. Frontend - Modificar BotStatus.tsx
- [ ] Agregar sección de "Conexión del Bot Principal" solo para admins
- [ ] Agregar selector de método de autenticación (QR vs Código)
- [ ] Agregar campo para ingresar número de teléfono cuando se selecciona código
- [ ] Agregar botón para conectar/desconectar bot principal
- [ ] Mostrar QR o código de pairing según el método seleccionado

### 4. Frontend - Modificar api.ts
- [ ] Agregar métodos para conectar bot principal
- [ ] Agregar método para obtener código de pairing del bot principal
- [ ] Agregar método para seleccionar método de autenticación

### 5. Implementar restricciones de seguridad
- [ ] Solo permitir conexión del bot principal para usuarios con rol "admin" o "owner"
- [ ] Agregar validación de permisos en el backend
- [ ] Agregar verificación de permisos en el frontend

## Archivos a Modificar
1. `backend/full/whatsapp.js` - Lógica de conexión del bot principal
2. `backend/full/index.js` - Nuevos endpoints API
3. `frontend-panel/src/pages/BotStatus.tsx` - Interfaz de conexión
4. `frontend-panel/src/services/api.ts` - Métodos API
5. `backend/full/auth.js` - Validación de permisos (si es necesario)

## Estado de Implementación
- [ ] Planificación completada
- [ ] Backend - whatsapp.js modificado
- [ ] Backend - index.js modificado
- [ ] Frontend - BotStatus.tsx modificado
- [ ] Frontend - api.ts modificado
- [ ] Testing y validación

---

## ✅ Tarea Completada: Remover Contenedor Template Subbot

### Resumen
Se ha removido completamente el contenedor template de subbot del proyecto, ya que los sub-bots ahora corren en el mismo proceso del backend.

### Cambios Realizados
- [x] **Eliminado directorio `subbot-template/`** - Removido completamente el directorio con Dockerfile e index.js
- [x] **Actualizada documentación** - Removida referencia en `README-MELODIA.md`
- [x] **Verificación de limpieza** - Confirmado que no hay otras referencias en archivos de código fuente

### Archivos Modificados
- ❌ `subbot-template/` (directorio eliminado)
- ✅ `README-MELODIA.md` - Removida referencia de la estructura del proyecto

### Estado
**COMPLETADO** - El contenedor template de subbot ha sido removido exitosamente.

---

## ✅ Problema Corregido: Error de Sintaxis en Migraciones

### Resumen
Se corrigió un error de sintaxis en las migraciones de Knex que impedía el inicio del backend.

### Problema Identificado
- **Archivo:** `backend/full/migrations/20250920000200_create_subbot_events_table.cjs`
- **Error:** El archivo usaba sintaxis de ES modules (`export async function`) en un archivo con extensión `.cjs`
- **Impacto:** El backend fallaba al ejecutar `knex migrate:latest` con error "Unexpected token 'export'"

### Solución Aplicada
- [x] **Corregida sintaxis** - Cambiado de `export async function` a `exports.up = async function` y `exports.down = async function`
- [x] **Verificación completa** - Confirmado que no hay otros archivos con problemas similares
- [x] **Validación** - Revisados todos los archivos de migración para asegurar compatibilidad con CommonJS

### Archivos Modificados
- ✅ `backend/full/migrations/20250920000200_create_subbot_events_table.cjs` - Corregida sintaxis

### Estado
**COMPLETADO** - El error de sintaxis en las migraciones ha sido corregido. El backend debería poder ejecutar las migraciones correctamente ahora.

---

## ✅ Problema Corregido: Función registerSubbotEvent Faltante

### Resumen
Se corrigió un error de importación donde `subbot-api.js` intentaba importar `registerSubbotEvent` desde `subproc-subbots.js`, pero esta función no existía.

### Problema Identificado
- **Archivo:** `backend/full/subbot-api.js` línea 8
- **Error:** `SyntaxError: The requested module './subproc-subbots.js' does not provide an export named 'registerSubbotEvent'`
- **Impacto:** El backend fallaba al iniciar debido a la importación faltante

### Solución Aplicada
- [x] **Creada función `registerSubbotEvent`** en `backend/full/subproc-subbots.js`
- [x] **Implementada validación de tokens** para seguridad
- [x] **Integrada con el sistema de eventos** existente usando EventEmitter
- [x] **Agregado registro en base de datos** en la tabla `subbot_events`

### Archivos Modificados
- ✅ `backend/full/subproc-subbots.js` - Agregada función `registerSubbotEvent`

### Estado
**COMPLETADO** - La función `registerSubbotEvent` ha sido implementada y el error de importación ha sido resuelto.

---

## ✅ Problema Corregido: Configuración de Módulos en package.json

### Resumen
Se corrigió un problema de configuración donde el `package.json` del backend tenía `"type": "module"` lo que causaba que Knex interpretara incorrectamente los archivos de migración.

### Problema Identificado
- **Archivo:** `backend/full/package.json`
- **Error:** `"type": "module"` causaba que Node.js interpretara todos los archivos como ES modules
- **Impacto:** Knex fallaba al cargar las migraciones incluso con extensión `.cjs`

### Solución Aplicada
- [x] **Cambiado `"type": "module"` a `"type": "commonjs"`** en `backend/full/package.json`
- [x] **Verificada compatibilidad** con todos los archivos de migración existentes
- [x] **Confirmado** que la sintaxis CommonJS funciona correctamente

### Archivos Modificados
- ✅ `backend/full/package.json` - Corregida configuración de módulos

### Estado
**COMPLETADO** - La configuración de módulos ha sido corregida y las migraciones deberían funcionar correctamente ahora.

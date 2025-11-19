# 🎯 Guía de Interfaz Interactiva - KONMI BOT

## Descripción General

El sistema de UI Interactiva proporciona **botones**, **listas categorizadas**, **todo-lists** y **copia de código** funcionales en WhatsApp usando WhiskeySockets/Baileys.

---

## 📋 Comandos Disponibles

### 1. **Copiar Código al Portapapeles** (`/copy`)

Envía código formateado que se puede seleccionar y copiar fácilmente en el móvil.

**Uso:**
```
/copy [código]
```

**Ejemplo:**
```
/copy npm install axios
/copy const x = 5;
/copy npm run dev
```

**Resultado:**
- El código se envía en un bloque formateado
- El usuario puede seleccionar y copiar directamente
- Se almacena en memoria por 1 hora

---

### 2. **Botones Interactivos** (`/buttons`)

Crea botones personalizados con comandos específicos para cada botón.

**Uso:**
```
/buttons [título] [botón1:comando1] [botón2:comando2] [botón3:comando3]
```

**Ejemplo:**
```
/buttons "Menú Principal" "Ver Perfil:/profile" "Ayuda:/help" "Status:/status"
/buttons "Opciones" "Sí:/yes" "No:/no" "Quizás:/maybe"
```

**Características:**
- Hasta 3 botones por mensaje
- Cada botón ejecuta un comando
- Compatible con todos los comandos del bot

---

### 3. **Crear Lista de Tareas** (`/todo`)

Crea una lista de tareas interactiva con soporte para marcar, desmarcar y eliminar ítems.

**Uso:**
```
/todo [nombre-lista] [tarea1] [tarea2] [tarea3] ...
```

**Ejemplo:**
```
/todo "Mi Lista" "Comprar comida" "Llamar a Juan" "Terminar proyecto"
/todo "Tareas del Trabajo" "Email al cliente" "Revisar código" "Hacer backup"
```

**Características:**
- Lista con checkboxes (☐/☑️)
- Número total de tareas
- ID automático para referencia

---

### 4. **Marcar Tarea Completada** (`/todo-mark`)

Marca un ítem de la lista como completado.

**Uso:**
```
/todo-mark [lista-id] [número-ítem]
```

**Ejemplo:**
```
/todo-mark todo_5xxxx_1234567890 1
```

**Resultado:**
- La tarea se marca con ☑️
- Se actualiza el contador de completadas
- Se muestra el progreso

---

### 5. **Desmarcar Tarea** (`/todo-unmark`)

Desmarca un ítem completado.

**Uso:**
```
/todo-unmark [lista-id] [número-ítem]
```

**Ejemplo:**
```
/todo-unmark todo_5xxxx_1234567890 1
```

---

### 6. **Eliminar Tarea** (`/todo-delete`)

Elimina un ítem de la lista.

**Uso:**
```
/todo-delete [lista-id] [número-ítem]
```

**Ejemplo:**
```
/todo-delete todo_5xxxx_1234567890 2
```

---

### 7. **Agregar Tarea** (`/todo-add`)

Agrega un nuevo ítem a la lista existente.

**Uso:**
```
/todo-add [lista-id] [nueva-tarea]
```

**Ejemplo:**
```
/todo-add todo_5xxxx_1234567890 "Nueva tarea importante"
```

---

### 8. **Menú por Categorías** (`/menucat`)

Muestra un menú interactivo con listas categorizadas de opciones.

**Uso:**
```
/menucat
```

**Categorías:**
- 🎯 **Inicio** - Menú principal, ayuda
- 📥 **Descargas** - Video, música, audio
- 🤖 **Sub-bots** - Código, QR, gestión
- 🛠️ **Utilidades** - Status, ping, stickers
- 👑 **Administración** *(solo propietario)* - Panel admin, broadcast

---

### 9. **Ayuda por Categorías** (`/helpcat`)

Muestra ayuda detallada organizada por categorías.

**Uso:**
```
/helpcat
```

**Estructura:**
```
📖 AYUDA POR CATEGORÍA

📥 Descargas
  • /video - Descarga videos
  • /music - Descarga música
  • ...

🤖 Sub-bots
  • /code - Genera código
  • ...

[Y más categorías]
```

---

## 🎨 Casos de Uso Avanzados

### Flujo de Trabajo Típico

**1. Enviar menú categorizado:**
```
/menucat
```

**2. Usuario selecciona opción**

**3. Responder con listas más específicas:**
```
/buttons "Descarga" "YouTube:/video" "TikTok:/video" "Instagram:/video"
```

---

### Gestión de Proyectos

**1. Crear lista de tareas:**
```
/todo "Proyecto Bot" "Diseño de UI" "Implementar API" "Testing" "Deployment"
```

**2. Marcar completadas:**
```
/todo-mark [id] 1
/todo-mark [id] 2
```

**3. Agregar tareas nuevas:**
```
/todo-add [id] "Documentación final"
```

---

### Compartir Código

**1. Usuario pide código:**
```
El usuario: ¿Cómo instalo dependencias?
```

**2. Responder con código copiable:**
```
/copy npm install
```

**Resultado:**
El usuario puede seleccionar el código y copiarlo directamente al portapapeles de su móvil.

---

## 💡 Tips y Trucos

### Caracteres Especiales
- Puedes usar emojis en títulos y opciones
- Los nombres deben ir sin comillas normales
- Usa `|` para separar opciones en botones si es necesario

### Performance
- Las listas se almacenan en memoria
- Se limpian automáticamente después de 1 hora
- Para muchas listas, usar IDs específicos

### Errores Comunes

❌ **Incorrecto:**
```
/todo "Mi Lista" (sin tareas)
/buttons (sin opciones)
/copy (sin código)
```

✅ **Correcto:**
```
/todo "Mi Lista" "Tarea 1" "Tarea 2"
/buttons "Menú" "Opción1:/cmd1" "Opción2:/cmd2"
/copy npm install axios
```

---

## 🔧 Integración con Otros Comandos

El sistema de UI Interactiva se integra con:
- **Descargas** (`/video`, `/music`, etc.)
- **Grupos** (`/groupinfo2`, `/announce`, etc.)
- **Perfil** (`/profile`, `/status`, etc.)
- **Sub-bots** (`/code`, `/qr`, `/mybots`)

---

## 📊 Estructura de Datos

### Lista de Tareas
```javascript
{
  id: "todo_[sender]_[timestamp]",
  name: "Mi Lista",
  items: [
    { id: "item_0", text: "Tarea 1", completed: false, index: 1 },
    { id: "item_1", text: "Tarea 2", completed: true, index: 2 }
  ],
  createdAt: "2025-01-01T00:00:00Z",
  updatedAt: "2025-01-01T00:05:00Z"
}
```

---

## ⚙️ Configuración

El sistema está totalmente integrado con Baileys y no requiere configuración adicional.

**Requisitos:**
- ✅ WhatsApp Web conectado
- ✅ Baileys/WhiskeySockets
- ✅ Node.js 16+

---

## 🐛 Solución de Problemas

| Problema | Solución |
|----------|----------|
| Botones no aparecen | Verifica que usas `:` para separar texto y comando |
| Lista de tareas no se actualiza | El ID puede haber expirado (1 hora) - crea una nueva |
| Código no se copia | Asegúrate de que esté dentro del bloque formateado |
| Menú categorizado vacío | Verifica que el usuario tiene permisos suficientes |

---

## 📝 Ejemplos Completos

### Ejemplo 1: Soporte Técnico
```
Usuario: /helpcat
Bot: [Envía ayuda por categorías]
Usuario selecciona: Descargas
Bot: /buttons "Descargas" "YouTube:/video" "Spotify:/music"
Usuario selecciona: YouTube
Bot: Envía tutorial de `/video`
```

### Ejemplo 2: Gestor de Proyectos
```
Usuario: /todo "Sprint 1" "Diseño" "Frontend" "Backend" "Testing"
Bot: [Envía lista con 5 tareas]
Usuario completa tareas: /todo-mark [id] 1, /todo-mark [id] 2
Bot: [Actualiza mostrando 2/5 completadas]
Usuario agrega: /todo-add [id] "Deploy"
Bot: [Actualiza lista a 6 tareas]
```

### Ejemplo 3: Sistema de Menú
```
Usuario: /menu
Bot: /buttons "Menú" "Categorías:/menucat" "Ayuda:/helpcat" "Estado:/status"
Usuario: /menucat
Bot: [Envía menú con categorías]
Usuario selecciona: Sub-bots
Bot: /buttons "Sub-bots" "Código:/code" "QR:/qr" "Mis Bots:/mybots"
```

---

## 🎓 Próximos Pasos

1. Explorar los comandos en tu chat
2. Combinar con otros comandos del bot
3. Crear flujos personalizados para tu equipo
4. Reportar bugs o sugerencias

---

**Versión:** 1.0  
**Actualizado:** 2025-01-19  
**Bot:** KONMI BOT - WhatsApp Puro

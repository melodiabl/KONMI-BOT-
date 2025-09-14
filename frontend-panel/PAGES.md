# Documentación de Páginas del Frontend

Este archivo describe el propósito y los componentes principales de cada archivo en `/src/pages`.

---

## AIChat.tsx
- **Propósito:** Chat con IA (GPT, Claude, etc.) para asistencia y preguntas.
- **Componentes:** Chat, selección de modelo, historial, envío de mensajes, scroll automático.

## Analytics.tsx
- **Propósito:** Panel de analíticas avanzadas del sistema (usuarios, grupos, aportes, pedidos, engagement, tendencias).
- **Componentes:** Estadísticas, gráficos, exportación, filtros de tiempo y métricas.

## Aportes.tsx
- **Propósito:** Gestión de aportes (contenido compartido por usuarios/proveedores).
- **Componentes:** Tabla de aportes, filtros, paginación, modal de edición, badges de estado/fuente.

## BotCommands.tsx
- **Propósito:** Listado y documentación de comandos del bot, con asistente IA para preguntas sobre comandos.
- **Componentes:** Acordeón de categorías, detalles de comando, prueba de comandos, preguntas a IA.

## BotStatus.tsx
- **Propósito:** Estado en tiempo real del bot de WhatsApp (conexión, teléfono, uptime).
- **Componentes:** Card de estado, botones de conectar/reiniciar, spinner de carga.

## Dashboard.tsx
- **Propósito:** Panel principal con resumen de estado del bot y estadísticas generales.
- **Componentes:** Cards de estado, estadísticas, badges, grids.

## Games.tsx
- **Propósito:** Juegos y entretenimiento para grupos (trivia, adivinanzas, etc.).
- **Componentes:** Cards de juegos, modal de configuración, badges de dificultad/categoría.

## Grupos.tsx
- **Propósito:** Gestión de grupos de WhatsApp (autorización, proveedor, edición, eliminación).
- **Componentes:** Tabla de grupos, filtros, paginación, modal de edición, switches, badges.

## Home.tsx
- **Propósito:** Página de inicio, muestra resumen de estadísticas y estado del bot.
- **Componentes:** Dashboard embebido, queries de usuarios, grupos, mensajes.

## Login.tsx
- **Propósito:** Página de autenticación con selector de roles y formulario de login.
- **Componentes:** Formulario de login, selector de roles, validación, manejo de errores, redirección.

## Usuarios.tsx
- **Propósito:** Gestión completa de usuarios del sistema con CRUD, filtros y estadísticas.
- **Componentes:** Tabla de usuarios, filtros por estado, modal de crear/editar, estadísticas, paginación, menú de acciones.

## Grupos.tsx
- **Propósito:** Gestión de grupos de WhatsApp con autorización y control de proveedores.
- **Componentes:** Tabla de grupos, filtros por autorización/proveedor, modal de crear/editar, estadísticas, controles de autorización.

## Dashboard.tsx
- **Propósito:** Panel principal con estadísticas generales, estado del bot y resumen del sistema.
- **Componentes:** Cards de estadísticas, estado del bot, gráficos de progreso, alertas, controles de bot.

## BotStatus.tsx
- **Propósito:** Página dedicada al monitoreo y control del bot de WhatsApp.
- **Componentes:** Estado de conexión, código QR, configuración, estadísticas de conexión, controles de reinicio/desconexión.

## Aportes.tsx
- **Propósito:** Gestión completa de aportes de contenido con aprobación y filtros.
- **Componentes:** Tabla de aportes, filtros por estado/tipo/fuente, modal de crear/editar, estadísticas, acciones de aprobar/rechazar.

## Pedidos.tsx
- **Propósito:** Gestión de pedidos de contenido con prioridades y estados.
- **Componentes:** Tabla de pedidos, filtros por estado/prioridad, modal de crear/editar, estadísticas, acciones de completar/cancelar.

## Logs.tsx
- **Propósito:** Visualización y gestión de logs del sistema con filtros y exportación.
- **Componentes:** Tabla de logs, filtros por nivel/servicio, estadísticas de niveles, auto-refresh, modal de detalles, exportación.

## Notificaciones.tsx
- **Propósito:** Gestión de notificaciones del sistema con estados de lectura.
- **Componentes:** Tabla de notificaciones, filtros por tipo/categoría/estado, estadísticas, acciones de marcar como leídas, modal de detalles.

## Settings.tsx
- **Propósito:** Configuración completa del sistema con múltiples secciones organizadas en tabs.
- **Componentes:** Tabs de configuración (Bot, Seguridad, Notificaciones, Sistema), formularios con validación, estadísticas del sistema, acciones de guardar/restaurar.

## Analytics.tsx
- **Propósito:** Análisis avanzado y métricas detalladas del sistema con visualizaciones.
- **Componentes:** Métricas principales, tabs de análisis (Resumen, Usuarios, Contenido, Rendimiento), gráficos de progreso, tablas de datos, filtros por período.

## Proveedores.tsx
- **Propósito:** Gestión de proveedores de contenido con calificaciones y estadísticas de rendimiento.
- **Componentes:** Tabla de proveedores, filtros por estado, estadísticas, modales de crear/editar/ver, información de contacto y pagos.

## Multimedia.tsx
- **Propósito:** Gestión de archivos multimedia con galería visual y funcionalidades de descarga.
- **Componentes:** Galería de archivos, filtros por tipo, estadísticas, modal de subida, vista de detalles, acciones de descarga y eliminación.

## Logs.tsx
- **Propósito:** Visualización y filtrado de logs del sistema.
- **Componentes:** Tabla de logs, filtros por nivel y búsqueda, paginación, descarga, auto-refresh.

## Multimedia.tsx
- **Propósito:** Gestión de archivos multimedia (subida, conversión, descarga, eliminación).
- **Componentes:** Cards de archivos, panel de subida, panel de conversión, lista de conversiones.

## Musica.tsx
- **Propósito:** Búsqueda y descarga de música con IA, estadísticas y géneros.
- **Componentes:** Tabs de búsqueda, populares, estadísticas, géneros, historial; cards de canciones.

## News.tsx
- **Propósito:** Noticias temáticas (yaoi/anime/manga), búsqueda y categorías.
- **Componentes:** Cards de noticias, filtros, búsqueda, badges, imágenes.

## Notificaciones.tsx
- **Propósito:** Gestión y visualización de notificaciones del sistema.
- **Componentes:** Cards de notificaciones, filtros, paginación, marcar como leídas.

## Pedidos.tsx
- **Propósito:** Gestión de pedidos de contenido (solicitudes de usuarios).
- **Componentes:** Tabla de pedidos, filtros, paginación, modal de edición, badges de estado.

## Proveedores.tsx
- **Propósito:** Gestión de proveedores y colaboradores (usuarios que suben contenido).
- **Componentes:** Tabla de proveedores, filtros, paginación, modal de edición, switches, badges.

## Settings.tsx
- **Propósito:** Configuración avanzada del bot y del sistema.
- **Componentes:** Formulario de configuración, cards de información, comandos del bot.

## Stats.tsx
- **Propósito:** Estadísticas generales y detalladas del sistema.
- **Componentes:** Cards de estadísticas, grids, barras de progreso, badges.

## Usuarios.tsx
- **Propósito:** Gestión de usuarios del sistema (roles, estado, edición, creación, eliminación).
- **Componentes:** Tabla de usuarios, filtros, paginación, modal de edición, cambio de contraseña, badges de roles/estado.

## Weather.tsx
- **Propósito:** Consulta de clima y pronóstico, adaptado a temática yaoi.
- **Componentes:** Formulario de ciudad/días, cards de clima/pronóstico, iconos, mensajes temáticos.

---

**Nota:** Todas las páginas usan Chakra UI, React Query y el servicio `apiService` para llamadas a la API. Muchas páginas usan modales, tablas, cards y badges para la UI.


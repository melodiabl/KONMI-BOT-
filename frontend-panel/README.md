# Frontend - Panel de Administración

Panel web de administración para el Bot de WhatsApp construido con React, Vite, Chakra UI y TypeScript.

## 🚀 Características

- **UI Moderna**: Chakra UI con modo claro/oscuro
- **Estado**: React Query para gestión de estado
- **Autenticación**: Context API con JWT
- **Responsive**: Diseño adaptativo
- **Notificaciones**: Toast notifications
- **Navegación**: Sidebar con rutas protegidas

## 📋 Páginas Implementadas

### 🏠 Dashboard
- Estado del bot en tiempo real
- Estadísticas generales
- Métricas de rendimiento

### 🤖 Bot Status
- Estado de conexión del bot
- Generación de QR para conexión
- Reinicio del bot
- Información de comandos disponibles

### 👥 Grupos
- Listado de grupos
- Crear/editar grupos
- Autorizar/desautorizar grupos
- Marcar como proveedor
- Búsqueda y filtrado

### 📚 Aportes
- Listado de aportes
- Moderación (aprobar/rechazar)
- Edición de metadatos
- Filtros por estado
- Información detallada

### 📝 Pedidos
- Listado de pedidos
- Resolver pedidos
- Asociar aportes
- Filtros por estado
- Información de usuarios

### ⚙️ Configuración
- Rate limits del bot
- TTL de URLs firmadas
- Información del sistema
- Comandos disponibles

### 📊 Estadísticas
- Métricas generales
- Distribución de grupos
- Estado de aportes
- Rendimiento de pedidos

## 🛠️ Tecnologías

- **React 18**: Biblioteca de UI
- **Vite**: Build tool y dev server
- **TypeScript**: Tipado estático
- **Chakra UI**: Componentes de UI
- **React Query**: Gestión de estado
- **React Router**: Navegación
- **Axios**: Cliente HTTP
- **React Hook Form**: Formularios
- **React Hot Toast**: Notificaciones

## 📦 Instalación

### Desarrollo Local

1. **Instalar dependencias**:
```bash
npm install
```

2. **Configurar variables de entorno**:
```bash
cp .env.example .env
# Editar .env con la URL del backend
```

3. **Ejecutar en desarrollo**:
```bash
npm run dev
```

4. **Abrir en navegador**:
```
http://localhost:5173
```

### Producción

1. **Construir aplicación**:
```bash
npm run build
```

2. **Previsualizar build**:
```bash
npm run preview
```

## 🔧 Configuración

### Variables de Entorno

| Variable | Descripción | Default |
|----------|-------------|---------|
| `VITE_API_URL` | URL del backend | `http://localhost:3001` |

### Scripts Disponibles

```bash
# Desarrollo
npm run dev          # Servidor de desarrollo
npm run build        # Construir para producción
npm run preview      # Previsualizar build
npm run lint         # Linting con ESLint
```

## 🎨 Componentes Principales

### Layout
- Sidebar con navegación
- Header con usuario y acciones
- Área principal de contenido

### Autenticación
- Login form con validación
- Context para estado de auth
- Rutas protegidas

### Tablas
- Paginación
- Búsqueda
- Filtros
- Acciones inline

### Modales
- Formularios de creación/edición
- Confirmaciones
- Información detallada

## 🔐 Autenticación

El sistema usa JWT para autenticación:

1. **Login**: Usuario y contraseña
2. **Token**: Almacenado en localStorage
3. **Context**: Estado global de autenticación
4. **Interceptor**: Token automático en requests
5. **Protección**: Rutas protegidas por roles

### Roles Disponibles
- `creadora`: Dueña del sistema
- `admin`: Administrador
- `usuario`: Usuario básico

## 📱 Responsive Design

- **Desktop**: Layout completo con sidebar
- **Tablet**: Sidebar colapsable
- **Mobile**: Navegación adaptada

## 🎯 Funcionalidades

### Dashboard
- ✅ Estado del bot en tiempo real
- ✅ Estadísticas con auto-refresh
- ✅ Métricas de rendimiento

### Gestión de Grupos
- ✅ CRUD completo
- ✅ Autorización/desautorización
- ✅ Toggle proveedor
- ✅ Búsqueda y filtrado

### Moderación de Aportes
- ✅ Listado con filtros
- ✅ Aprobar/rechazar
- ✅ Edición de metadatos
- ✅ Información detallada

### Gestión de Pedidos
- ✅ Listado con estados
- ✅ Resolver pedidos
- ✅ Asociar aportes
- ✅ Información de usuarios

### Configuración
- ✅ Rate limits
- ✅ TTL de URLs
- ✅ Información del sistema
- ✅ Comandos disponibles

### Estadísticas
- ✅ Métricas generales
- ✅ Distribución de datos
- ✅ Gráficos de progreso
- ✅ Auto-refresh

## 🐳 Docker

### Desarrollo
```bash
# Construir imagen
docker build -t whatsapp-bot-frontend .

# Ejecutar contenedor
docker run -p 5173:5173 whatsapp-bot-frontend
```

### Producción con Caddy
```bash
# Construir y ejecutar
docker compose up -d frontend
```

## 🔍 Estructura del Proyecto

```
src/
├── components/          # Componentes reutilizables
│   ├── Layout.tsx      # Layout principal
│   ├── Sidebar.tsx     # Navegación lateral
│   └── LoginForm.tsx   # Formulario de login
├── contexts/           # Contextos de React
│   └── AuthContext.tsx # Contexto de autenticación
├── pages/              # Páginas de la aplicación
│   ├── Dashboard.tsx   # Dashboard principal
│   ├── BotStatus.tsx   # Estado del bot
│   ├── Grupos.tsx      # Gestión de grupos
│   ├── Aportes.tsx     # Moderación de aportes
│   ├── Pedidos.tsx     # Gestión de pedidos
│   ├── Settings.tsx    # Configuración
│   └── Stats.tsx       # Estadísticas
├── services/           # Servicios externos
│   └── api.ts          # Cliente de API
├── types/              # Tipos TypeScript
│   └── index.ts        # Interfaces principales
├── App.tsx             # Componente principal
├── main.tsx            # Punto de entrada
└── theme.ts            # Tema de Chakra UI
```

## 🚨 Troubleshooting

### Error de CORS
- Verificar `VITE_API_URL` en variables de entorno
- Comprobar configuración CORS en backend

### Error de autenticación
- Verificar token en localStorage
- Comprobar expiración del JWT
- Revisar logs del backend

### Error de conexión
- Verificar que el backend esté corriendo
- Comprobar URL de la API
- Revisar logs del navegador

## 🤝 Contribución

1. Fork el proyecto
2. Crear rama para feature
3. Implementar cambios
4. Ejecutar tests y linting
5. Crear Pull Request

## 📄 Licencia

MIT License - ver archivo LICENSE para detalles.

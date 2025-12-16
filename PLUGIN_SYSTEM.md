# 🚀 Sistema de Plugins Automático

## 📋 Descripción

El sistema de plugins automático permite cargar y registrar comandos de forma dinámica sin necesidad de configuración manual en el handler principal.

## 🎯 Características

- ✅ **Auto-discovery**: Escanea automáticamente todos los archivos `.js` en `/plugins/`
- ✅ **Carga dinámica**: Importa módulos solo cuando se necesitan
- ✅ **Cache inteligente**: Evita recargas innecesarias
- ✅ **Múltiples métodos**: Soporta diferentes formas de definir comandos
- ✅ **Error handling**: Manejo robusto de errores
- ✅ **Zero-config**: Funciona sin configuración para casos básicos

## 📁 Estructura de Plugins

### Método 1: Configuración de comandos (RECOMENDADO)

```javascript
// plugins/mi-plugin.js

export const commands = [
  {
    name: 'micomando',
    handler: 'handleMiComando',
    category: 'MiCategoria',
    description: 'Descripción del comando',
    admin: false
  }
];

export async function handleMiComando(ctx) {
  // Lógica del comando
  return { success: true, message: 'Comando ejecutado' };
}
```

### Método 2: Objeto COMMANDS

```javascript
// plugins/otro-plugin.js

export const COMMANDS = {
  comando1: {
    handler: 'handleComando1',
    category: 'Categoria',
    description: 'Primer comando',
    admin: false
  },
  comando2: {
    handler: 'handleComando2',
    category: 'Categoria',
    description: 'Segundo comando',
    admin: true
  }
};

export async function handleComando1(ctx) { /* ... */ }
export async function handleComando2(ctx) { /* ... */ }
```

### Método 3: Auto-detección (BÁSICO)

```javascript
// plugins/simple-plugin.js

// Todas las funciones exportadas se registran automáticamente
export async function ping(ctx) { /* ... */ }
export async function status(ctx) { /* ... */ }
export async function info(ctx) { /* ... */ }
```

## 🔧 Configuración de Comandos

### Propiedades disponibles:

- **`name`**: Nombre del comando (sin `/`)
- **`handler`**: Nombre de la función que maneja el comando
- **`category`**: Categoría para organización (ej: 'Utilidades', 'Entretenimiento')
- **`description`**: Descripción breve del comando
- **`admin`**: `true` si requiere permisos de admin, `false` por defecto

## 🎮 Context Object (ctx)

Cada función de comando recibe un objeto `ctx` con:

```javascript
{
  sock,           // Socket de WhatsApp
  remoteJid,      // ID del chat
  sender,         // Número del remitente
  pushName,       // Nombre del remitente
  message,        // Objeto del mensaje
  text,           // Texto del mensaje
  args,           // Argumentos del comando
  isGroup,        // true si es grupo
  command,        // Nombre del comando ejecutado
  commandConfig   // Configuración del comando
}
```

## 📤 Formato de Respuesta

Las funciones deben retornar un objeto con:

```javascript
{
  success: true/false,
  message: 'Texto a enviar',
  type: 'text/image/video/audio', // opcional
  data: { /* datos adicionales */ } // opcional
}
```

## 🔄 Carga Automática

El sistema:

1. **Escanea** `/plugins/` buscando archivos `.js`
2. **Importa** cada módulo dinámicamente
3. **Detecta** comandos usando los métodos soportados
4. **Registra** comandos en el `commandMap`
5. **Cachea** módulos para reutilización

## 🛠️ Comandos de Debug

- `/debugcommands` - Ver todos los comandos registrados (solo admin)

## 📊 Logs del Sistema

Al iniciar, verás:

```
🚀 Inicializando sistema de plugins...
🔍 Encontrados X archivos de plugins
✅ Plugin cargado: nombre-plugin
📝 Comando registrado: /comando (Categoria)
✅ Cargados X plugins exitosamente

🎉 SISTEMA DE PLUGINS INICIALIZADO
=====================================
📦 Plugins cargados: X
📋 Total comandos: X
🏠 Comandos locales: X
🔗 Comandos de módulos: X
=====================================
```

## 🎯 Mejores Prácticas

### ✅ Hacer:
- Usar nombres descriptivos para comandos
- Incluir descripciones claras
- Manejar errores apropiadamente
- Usar categorías consistentes
- Documentar funciones complejas

### ❌ Evitar:
- Nombres de comandos duplicados
- Funciones síncronas (usar async)
- Comandos sin descripción
- Lógica compleja en un solo archivo
- Dependencias circulares

## 🔧 Ejemplo Completo

Ver `plugins/example-plugin.js` para un ejemplo completo con todos los métodos soportados.

## 🚨 Troubleshooting

### Plugin no se carga:
- Verificar sintaxis del archivo
- Comprobar que esté en `/plugins/`
- Revisar logs de consola

### Comando no se registra:
- Verificar configuración de `commands` o `COMMANDS`
- Comprobar que la función handler existe
- Revisar nombres de funciones

### Error al ejecutar comando:
- Verificar que la función sea `async`
- Comprobar manejo de errores
- Revisar formato de respuesta

## 🔄 Recarga de Plugins

Para recargar plugins sin reiniciar:

```javascript
// Limpiar cache
pluginCache.clear();
commandMap.clear();

// Recargar sistema
await initializePluginSystem();
```

## 📈 Rendimiento

- **Cache**: Los módulos se cargan una vez y se reutilizan
- **Lazy loading**: Módulos se cargan solo cuando se necesitan
- **Error isolation**: Errores en un plugin no afectan otros
- **Memory efficient**: Cache inteligente evita memory leaks

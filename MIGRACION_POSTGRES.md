# Migración de SQLite a PostgreSQL

Esta guía te ayudará a migrar los datos de tu base de datos SQLite a PostgreSQL.

## Requisitos previos

1. Tener instalado Node.js y npm
2. Tener PostgreSQL instalado y en ejecución
3. Tener acceso de administrador a la base de datos PostgreSQL

## Configuración inicial

1. **Configura las variables de entorno** en el archivo `.env` en la carpeta `backend/full/` con los datos de tu PostgreSQL:

```env
DB_CLIENT=pg
DB_HOST=localhost
DB_PORT=5432
DB_USER=tu_usuario
DB_PASSWORD=tu_contraseña
DB_NAME=konmi_bot
```

## Pasos para la migración

### 1. Crear la base de datos PostgreSQL

```bash
# Navega a la carpeta del proyecto
cd backend/full

# Instala las dependencias si no las tienes
npm install pg

# Ejecuta el script de configuración
node scripts/setup-postgres.js
```

### 2. Exportar datos de SQLite

```bash
# Asegúrate de estar en la carpeta correcta
cd backend/full

# Crea el directorio de exportaciones si no existe
mkdir -p exports

# Ejecuta el script de exportación
node scripts/export-sqlite.js
```

### 3. Ejecutar migraciones en PostgreSQL

```bash
# Asegúrate de que las migraciones estén configuradas para PostgreSQL
# Verifica que en knexfile.js esté configurado el cliente 'pg'

# Ejecuta las migraciones
npx knex migrate:latest
```

### 4. Importar datos a PostgreSQL

```bash
# Asegúrate de que el archivo .env esté configurado correctamente
# Luego ejecuta el script de importación
node scripts/import-postgres.js
```

## Verificación

1. Verifica que todas las tablas se hayan creado correctamente:
   ```sql
   \dt
   ```

2. Verifica que los datos se hayan importado correctamente:
   ```sql
   SELECT table_name, COUNT(*) as count 
   FROM information_schema.tables 
   WHERE table_schema = 'public' 
   GROUP BY table_name;
   ```

## Solución de problemas

### Error de conexión
- Verifica que PostgreSQL esté en ejecución
- Verifica que el usuario y contraseña sean correctos
- Verifica que el puerto sea el correcto (por defecto 5432)

### Problemas con los datos
- Si hay problemas con tipos de datos, revisa las migraciones
- Verifica que las claves foráneas sean consistentes

### Problemas de permisos
- Asegúrate de que el usuario tenga permisos suficientes
- Si es necesario, otorga permisos manualmente:
  ```sql
  GRANT ALL PRIVILEGES ON DATABASE konmi_bot TO tu_usuario;
  GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO tu_usuario;
  GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO tu_usuario;
  ```

## Configuración final

Una vez completada la migración, actualiza tu aplicación para usar PostgreSQL. Asegúrate de que la configuración en `knexfile.js` esté correcta:

```javascript
module.exports = {
  development: {
    client: 'pg',
    connection: {
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME
    },
    migrations: {
      directory: './migrations'
    }
  }
  // ... otras configuraciones
};
```

## Soporte

Si encuentras algún problema durante la migración, por favor abre un issue en el repositorio con los siguientes detalles:
- Descripción del error
- Mensajes de error completos
- Pasos para reproducir el problema
- Versiones de Node.js y PostgreSQL que estás utilizando

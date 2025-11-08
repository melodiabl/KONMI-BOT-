import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import knex from 'knex';
import knexfile from '../knexfile.js';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Cargar variables de entorno
dotenv.config({ path: join(__dirname, '..', '.env') });

// Configuración de la base de datos
const config = {
  host: process.env.DB_HOST || 'localhost', 
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER || 'postgres', 
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'konmi_bot'
};

// Función para ejecutar comandos SQL
async function runQuery(query, params = []) {
  try {
    const db = knex({
      client: 'pg',
      connection: {
        ...config,
        database: 'postgres' // Conectar a la base de datos por defecto
      }
    });

    const result = await db.raw(query, params);
    await db.destroy();
    return result;
  } catch (error) {
    console.error('Error al ejecutar la consulta:', error.message);
    throw error;
  }
}

// Crear base de datos si no existe
async function createDatabase() {
  try {
    console.log('🔍 Verificando base de datos...');
    
    // Verificar si la base de datos ya existe
    const dbExists = await runQuery(
      "SELECT 1 FROM pg_database WHERE datname = ?", 
      [config.database]
    );

    if (dbExists.rows.length === 0) {
      console.log(`🆕 Creando base de datos ${config.database}...`);
      await runQuery(`CREATE DATABASE ${config.database}`);
      console.log('✅ Base de datos creada exitosamente');
    } else {
      console.log('ℹ️  La base de datos ya existe');
    }

    // Verificar si el usuario existe
    const userExists = await runQuery(
      "SELECT 1 FROM pg_roles WHERE rolname = ?",
      [config.user]
    );

    if (userExists.rows.length === 0) {
      console.log(`👤 Creando usuario ${config.user}...`);
      await runQuery(
        `CREATE USER ${config.user} WITH PASSWORD ?`,
        [config.password]
      );
      console.log('✅ Usuario creado exitosamente');
    } else {
      console.log('ℹ️  El usuario ya existe');
    }

    // Otorgar permisos
    console.log('🔑 Otorgando permisos...');
    await runQuery(
      `GRANT ALL PRIVILEGES ON DATABASE ${config.database} TO ${config.user}`
    );
    
    console.log('\n✨ Configuración completada con éxito!');
    console.log(`\n📋 Detalles de conexión:`);
    console.log(`   Host: ${config.host}`);
    console.log(`   Puerto: ${config.port}`);
    console.log(`   Base de datos: ${config.database}`);
    console.log(`   Usuario: ${config.user}`);
    
  } catch (error) {
    console.error('❌ Error durante la configuración:', error.message);
    if (error.message.includes('password authentication failed')) {
      console.log('\n🔑 Error de autenticación. Verifica las credenciales de PostgreSQL.');
      console.log('   Asegúrate de que el usuario y contraseña sean correctos y que el usuario tenga permisos.');
    }
    process.exit(1);
  }
}

// Ejecutar configuración
createDatabase();

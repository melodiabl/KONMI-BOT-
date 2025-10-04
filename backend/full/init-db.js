import knex from 'knex';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, unlinkSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const dbPath = join(__dirname, 'storage', 'database.sqlite');

// Configuración de Knex
const config = {
  client: 'sqlite3',
  connection: {
    filename: dbPath
  },
  useNullAsDefault: true,
  pool: {
    afterCreate: (conn, cb) => conn.run('PRAGMA foreign_keys = ON', cb)
  }
};

// Función para crear la tabla subbots
async function createSubbotsTable() {
  const db = knex(config);
  
  try {
    // Verificar si la tabla ya existe
    const tableExists = await db.schema.hasTable('subbots');
    
    if (tableExists) {
      console.log('ℹ️ La tabla subbots ya existe. Eliminando...');
      await db.schema.dropTable('subbots');
    }
    
    // Crear la tabla con la estructura correcta
    console.log('🔄 Creando tabla subbots...');
    await db.schema.createTable('subbots', (table) => {
      table.increments('id').primary();
      table.string('code').unique().notNullable();
      table.string('user_phone').notNullable();
      table.string('user_name').nullable();
      table.string('status').defaultTo('pending');
      table.string('connection_type').defaultTo('qr');
      table.text('qr_code').nullable();
      table.string('pairing_code').nullable();
      table.text('session_data').nullable();
      table.timestamp('created_at').defaultTo(db.fn.now());
      table.timestamp('last_activity').defaultTo(db.fn.now());
      table.timestamp('connected_at').nullable();
      table.boolean('is_active').defaultTo(false);
      table.integer('message_count').defaultTo(0);
      table.json('settings').nullable();
      
      // Índices para optimizar consultas
      table.index('user_phone');
      table.index('status');
      table.index('is_active');
      table.index('last_activity');
    });
    
    console.log('✅ Tabla subbots creada exitosamente');
    
  } catch (error) {
    console.error('❌ Error al crear la tabla subbots:', error);
    throw error;
  } finally {
    await db.destroy();
  }
}

// Función principal
async function main() {
  try {
    console.log('🚀 Inicializando base de datos...');
    
    // Crear la tabla subbots
    await createSubbotsTable();
    
    console.log('\n✨ Base de datos inicializada correctamente');
    console.log(`📁 Ubicación: ${dbPath}`);
    
  } catch (error) {
    console.error('\n❌ Error durante la inicialización:', error);
    process.exit(1);
  }
}

// Ejecutar la inicialización
main();

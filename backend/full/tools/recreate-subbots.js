import db from './db.js';

async function recreateSubbotsTable() {
  try {
    console.log(' Recreando la tabla subbots...');

    // Verificar si la tabla existe y eliminarla
    const tableExists = await db.schema.hasTable('subbots');
    if (tableExists) {
      console.log('  Eliminando tabla subbots existente...');
      await db.schema.dropTable('subbots');
    }

    // Crear la tabla con la estructura correcta
    console.log(' Creando nueva tabla subbots...');
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

      // ndices para optimizar consultas
      table.index('user_phone');
      table.index('status');
      table.index('is_active');
      table.index('last_activity');
    });

    console.log(' Tabla subbots recreada exitosamente');

  } catch (error) {
    console.error(' Error al recrear la tabla subbots:', error);
  } finally {
    try {
      await db.destroy();
      console.log(' Conexin cerrada.');
    } catch (e) {
      console.error('Error al cerrar la conexin:', e);
    }
    process.exit(0);
  }
}

recreateSubbotsTable();

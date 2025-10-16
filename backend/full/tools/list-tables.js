import db from './db.js';

async function listTables() {
  try {
    console.log(' Tablas en la base de datos:');

    // SQLite specific query to list all tables
    const tables = await db.raw("SELECT name FROM sqlite_master WHERE type='table'");

    if (!tables || !tables.length) {
      console.log('No se encontraron tablas en la base de datos.');
      return;
    }

    console.log(tables.map(t => `- ${t.name}`).join('\n'));

    // For each table, show columns
    for (const table of tables) {
      console.log(`\n Estructura de la tabla ${table.name}:`);
      try {
        const columns = await db(table.name).columnInfo();
        console.log(Object.keys(columns).join(', '));
      } catch (e) {
        console.log(`  No se pudo obtener la estructura: ${e.message}`);
      }
    }

  } catch (error) {
    console.error('Error al listar tablas:', error);
  } finally {
    try {
      await db.destroy();
      console.log('\n Conexin cerrada.');
    } catch (e) {
      // Ignore
    }
  }
}

listTables();

import db from '../db.js';

try {
  const columnInfo = await db('subbots').columnInfo();
  const columns = Object.keys(columnInfo);
  console.log(`Columnas subbots (${columns.length}):`);
  columns.forEach((col) => console.log(`- ${col}`));

  const count = await db('knex_migrations').count('id as total').first();
  console.log('Migraciones registradas:', Number(count?.total ?? 0));

  const latest = await db('knex_migrations').orderBy('id', 'desc').limit(5);
  console.log('Últimas migraciones:', JSON.stringify(latest, null, 2));
} catch (error) {
  console.error('Inspection error:', error);
} finally {
  await db.destroy();
}

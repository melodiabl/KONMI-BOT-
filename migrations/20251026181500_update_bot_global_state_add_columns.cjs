/**
 * Ensure bot_global_state has the extended columns used by runtime helpers
 * Columns: estado (text), activado_por (text), fecha_cambio (timestamp)
 * Compatible with both SQLite and Postgres.
 * @param { import('knex').Knex } knex
 */
async function up(knex) {
  const hasTable = await knex.schema.hasTable('bot_global_state');
  const client = (knex.client && knex.client.config && knex.client.config.client) || '';
  const isSqlite = typeof client === 'string' && client.toLowerCase().includes('sqlite');
  if (!hasTable) {
    // Create minimal table if it does not exist yet
    await knex.schema.createTable('bot_global_state', (t) => {
      t.increments('id').primary();
      t.boolean('is_on').notNullable().defaultTo(true);
      t.string('estado');
      t.string('activado_por');
      t.timestamp('fecha_cambio').defaultTo(knex.fn.now());
      t.timestamp('created_at').defaultTo(knex.fn.now());
      t.timestamp('updated_at').defaultTo(knex.fn.now());
    });
    await knex('bot_global_state').insert({ is_on: true, estado: 'on' }).catch(() => {});
    return;
  }

  const addIfMissing = async (column, builder, sqliteBuilderNoDefault) => {
    const exists = await knex.schema.hasColumn('bot_global_state', column);
    if (!exists) {
      if (isSqlite && typeof sqliteBuilderNoDefault === 'function') {
        await knex.schema.alterTable('bot_global_state', sqliteBuilderNoDefault);
      } else {
        await knex.schema.alterTable('bot_global_state', builder);
      }
    }
  };

  await addIfMissing('estado', (t) => t.string('estado'));
  await addIfMissing('activado_por', (t) => t.string('activado_por'));
  await addIfMissing(
    'fecha_cambio',
    (t) => t.timestamp('fecha_cambio').defaultTo(knex.fn.now()),
    (t) => t.timestamp('fecha_cambio')
  );
  await addIfMissing(
    'created_at',
    (t) => t.timestamp('created_at').defaultTo(knex.fn.now()),
    (t) => t.timestamp('created_at')
  );
  await addIfMissing(
    'updated_at',
    (t) => t.timestamp('updated_at').defaultTo(knex.fn.now()),
    (t) => t.timestamp('updated_at')
  );

  // Backfill timestamps for sqlite (or if columns were just created without defaults)
  try {
    await knex('bot_global_state')
      .whereNull('fecha_cambio')
      .update({ fecha_cambio: new Date().toISOString() });
  } catch (_) {}
  try {
    await knex('bot_global_state')
      .whereNull('created_at')
      .update({ created_at: new Date().toISOString() });
  } catch (_) {}
  try {
    await knex('bot_global_state')
      .whereNull('updated_at')
      .update({ updated_at: new Date().toISOString() });
  } catch (_) {}
}

/**
 * @param { import('knex').Knex } knex
 */
async function down(knex) {
  // Non-destructive: keep table and columns, just no-op
}

module.exports = { up, down };

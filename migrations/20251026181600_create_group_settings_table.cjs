/**
 * Create group_settings to track per-group activation state
 * Columns: id, group_id (unique), is_active, created_at, updated_at
 * @param { import('knex').Knex } knex
 */
async function up(knex) {
  const client = (knex.client && knex.client.config && knex.client.config.client) || '';
  const isSqlite = typeof client === 'string' && client.toLowerCase().includes('sqlite');
  const exists = await knex.schema.hasTable('group_settings');
  if (!exists) {
    await knex.schema.createTable('group_settings', (t) => {
      t.increments('id').primary();
      t.string('group_id').notNullable().unique();
      t.boolean('is_active').notNullable().defaultTo(true);
      t.string('updated_by');
      t.timestamp('created_at').defaultTo(knex.fn.now());
      t.timestamp('updated_at').defaultTo(knex.fn.now());
    });
  } else {
    // Ensure required columns exist with correct types
    const ensureCol = async (name, builder, sqliteBuilderNoDefault) => {
      const has = await knex.schema.hasColumn('group_settings', name);
      if (!has) {
        if (isSqlite && typeof sqliteBuilderNoDefault === 'function') {
          await knex.schema.alterTable('group_settings', sqliteBuilderNoDefault);
        } else {
          await knex.schema.alterTable('group_settings', builder);
        }
      }
    };
    await ensureCol('group_id', (t) => t.string('group_id').notNullable().unique());
    await ensureCol('is_active', (t) => t.boolean('is_active').notNullable().defaultTo(true));
    await ensureCol('updated_by', (t) => t.string('updated_by'));
    await ensureCol('created_at', (t) => t.timestamp('created_at').defaultTo(knex.fn.now()), (t)=> t.timestamp('created_at'));
    await ensureCol('updated_at', (t) => t.timestamp('updated_at').defaultTo(knex.fn.now()), (t)=> t.timestamp('updated_at'));
    // Backfill for sqlite if timestamps were just added without defaults
    try { await knex('group_settings').whereNull('created_at').update({ created_at: new Date().toISOString() }); } catch (_) {}
    try { await knex('group_settings').whereNull('updated_at').update({ updated_at: new Date().toISOString() }); } catch (_) {}
  }
}

/**
 * @param { import('knex').Knex } knex
 */
async function down(knex) {
  // We keep table; if needed uncomment to drop
  // await knex.schema.dropTableIfExists('group_settings');
}

module.exports = { up, down };

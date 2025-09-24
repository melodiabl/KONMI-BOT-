/**
 * @param { import('knex').Knex } knex
 */
async function up(knex) {
  const exists = await knex.schema.hasTable('bot_global_state');
  if (exists) {
    const hasIsOn = await knex.schema.hasColumn('bot_global_state', 'is_on');
    if (!hasIsOn) {
      await knex.schema.alterTable('bot_global_state', (table) => {
        table.boolean('is_on').defaultTo(true);
      });
    }
    const hasCreatedAt = await knex.schema.hasColumn('bot_global_state', 'created_at');
    if (!hasCreatedAt) {
      await knex.schema.alterTable('bot_global_state', (table) => {
        table.timestamp('created_at').defaultTo(knex.fn.now());
      });
    }
    const hasUpdatedAt = await knex.schema.hasColumn('bot_global_state', 'updated_at');
    if (!hasUpdatedAt) {
      await knex.schema.alterTable('bot_global_state', (table) => {
        table.timestamp('updated_at').defaultTo(knex.fn.now());
      });
    }
    return;
  }

  await knex.schema.createTable('bot_global_state', (table) => {
    table.increments('id').primary();
    table.boolean('is_on').defaultTo(true);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  await knex('bot_global_state').insert({ is_on: true });
}

/**
 * @param { import('knex').Knex } knex
 */
async function down(knex) {
  const exists = await knex.schema.hasTable('bot_global_state');
  if (!exists) return;
  await knex.schema.dropTable('bot_global_state');
}

module.exports = { up, down };

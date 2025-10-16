/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
const up = function(knex) {
  return knex.schema.createTable('subbots', function(table) {
    table.increments('id').primary();
    table.string('request_jid').notNullable();
    table.string('session_id').unique();
    table.string('method').notNullable();
    table.string('label');
    table.string('bot_number');
    table.string('auth_path');
    table.string('status').defaultTo('pending');
    table.timestamp('last_check').defaultTo(knex.fn.now());
    table.timestamp('creation_time').defaultTo(knex.fn.now());
    table.jsonb('meta').defaultTo('{}');
    table.index(['request_jid', 'status']);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
const down = function(knex) {
  return knex.schema.dropTable('subbots');
};

export { up, down };
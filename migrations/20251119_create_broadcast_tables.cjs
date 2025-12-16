/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
  await knex.schema.createTable('broadcast_lists', (table) => {
    table.increments('id').primary();
    table.string('name').notNullable().unique();
    table.string('creator').notNullable(); // JID of the creator
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('broadcast_recipients', (table) => {
    table.increments('id').primary();
    table.integer('list_id').unsigned().notNullable();
    table.string('jid').notNullable(); // JID of the recipient
    table.timestamp('added_at').notNullable().defaultTo(knex.fn.now());

    table.foreign('list_id').references('id').inTable('broadcast_lists').onDelete('CASCADE');
    table.unique(['list_id', 'jid']);
  });
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
  await knex.schema.dropTableIfExists('broadcast_recipients');
  await knex.schema.dropTableIfExists('broadcast_lists');
}

/**
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function up(knex) {
  const has = await knex.schema.hasTable('wa_contacts');
  if (!has) {
    await knex.schema.createTable('wa_contacts', (t) => {
      t.increments('id').primary();
      t.string('wa_number').unique().notNullable();
      t.string('display_name');
      t.timestamp('updated_at').defaultTo(knex.fn.now());
    });
  }
};

/**
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function down(knex) {
  const has = await knex.schema.hasTable('wa_contacts');
  if (has) await knex.schema.dropTable('wa_contacts');
};


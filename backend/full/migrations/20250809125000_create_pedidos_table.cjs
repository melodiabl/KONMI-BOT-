/**
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function up(knex) {
  const has = await knex.schema.hasTable('pedidos');
  if (!has) {
    await knex.schema.createTable('pedidos', (t) => {
      t.increments('id').primary();
      t.text('texto').notNullable();
      t.string('estado').defaultTo('pendiente');
      t.string('usuario').notNullable();
      t.string('grupo').nullable();
      t.timestamp('fecha').defaultTo(knex.fn.now());
    });
  }
};

/**
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function down(knex) {
  const has = await knex.schema.hasTable('pedidos');
  if (has) await knex.schema.dropTable('pedidos');
};

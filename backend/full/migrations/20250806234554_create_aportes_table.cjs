/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function up(knex) {
  const exists = await knex.schema.hasTable('aportes');
  if (exists) return;
  await knex.schema.createTable('aportes', (table) => {
    table.increments('id').primary();
    table.string('titulo').notNullable();
    table.string('tipo');
    table.string('usuario');
    table.string('archivo');
    table.timestamp('fecha_aporte').defaultTo(knex.fn.now());
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function down(knex) {
  const exists = await knex.schema.hasTable('aportes');
  if (!exists) return;
  await knex.schema.dropTable('aportes');
};

/**
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function up(knex) {
  const has = await knex.schema.hasTable('votos');
  if (!has) {
    await knex.schema.createTable('votos', (t) => {
      t.increments('id').primary();
      t.integer('votacion_id').notNullable();
      t.string('usuario').notNullable();
      t.string('opcion').notNullable();
      t.timestamp('fecha').defaultTo(knex.fn.now());
      t.unique(['votacion_id', 'usuario']);
    });
  }
};

/**
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function down(knex) {
  const has = await knex.schema.hasTable('votos');
  if (has) await knex.schema.dropTable('votos');
};






/**
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function up(knex) {
  const has = await knex.schema.hasTable('descargas');
  if (has) return;
  await knex.schema.createTable('descargas', (t) => {
    t.increments('id').primary();
    t.string('filename').notNullable();
    t.string('filepath').notNullable();
    t.string('category').notNullable();
    t.string('usuario').notNullable();
    t.bigInteger('size').defaultTo(0);
    t.string('source');
    t.timestamp('fecha').defaultTo(knex.fn.now());
    t.string('estado').defaultTo('completada');
  });
};

/**
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function down(knex) {
  const has = await knex.schema.hasTable('descargas');
  if (has) await knex.schema.dropTable('descargas');
};


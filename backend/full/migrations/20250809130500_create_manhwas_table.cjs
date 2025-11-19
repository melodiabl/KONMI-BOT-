/**
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function up(knex) {
  const has = await knex.schema.hasTable('manhwas');
  if (!has) {
    await knex.schema.createTable('manhwas', (t) => {
      t.increments('id').primary();
      t.string('titulo').notNullable();
      t.string('autor').nullable();
      t.string('genero').nullable();
      t.string('estado').nullable();
      t.text('descripcion').nullable();
      t.string('url').nullable();
      t.string('proveedor').nullable();
      t.timestamp('fecha_registro').defaultTo(knex.fn.now());
      t.string('usuario_registro').nullable();
    });
  }
};

/**
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function down(knex) {
  const has = await knex.schema.hasTable('manhwas');
  if (has) await knex.schema.dropTable('manhwas');
};

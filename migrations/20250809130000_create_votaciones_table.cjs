/**
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function up(knex) {
  const has = await knex.schema.hasTable('votaciones');
  if (!has) {
    await knex.schema.createTable('votaciones', (t) => {
      t.increments('id').primary();
      t.string('titulo').notNullable();
      t.text('descripcion').nullable();
      t.text('opciones').notNullable(); // JSON.stringify([...])
      t.timestamp('fecha_inicio').defaultTo(knex.fn.now());
      t.timestamp('fecha_fin').nullable();
      t.string('estado').defaultTo('activa');
      t.string('creador').notNullable();
      t.string('grupo_jid').nullable();
    });
  }
};

/**
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function down(knex) {
  const has = await knex.schema.hasTable('votaciones');
  if (has) await knex.schema.dropTable('votaciones');
};

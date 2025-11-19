/**
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function up(knex) {
  const has = await knex.schema.hasTable('notificaciones');
  if (!has) {
    await knex.schema.createTable('notificaciones', (t) => {
      t.increments('id').primary();
      t.string('usuario').notNullable(); // username destinatario
      t.string('titulo').notNullable();
      t.text('mensaje').notNullable();
      t.string('tipo').defaultTo('info'); // info, warning, aporte, votacion, etc
      t.boolean('leida').defaultTo(false);
      t.timestamp('fecha').defaultTo(knex.fn.now());
      t.json('extra').nullable(); // datos adicionales (ej: id de aporte)
    });
  }
};

/**
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function down(knex) {
  const has = await knex.schema.hasTable('notificaciones');
  if (has) await knex.schema.dropTable('notificaciones');
};

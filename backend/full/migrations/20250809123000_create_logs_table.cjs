exports.up = async function up(knex) {
  const exists = await knex.schema.hasTable('logs');
  if (exists) return;
  await knex.schema.createTable('logs', function(table) {
    table.increments('id').primary();
    table.string('tipo').notNullable();
    table.string('comando').notNullable();
    table.string('usuario').notNullable();
    table.string('grupo').nullable();
    table.timestamp('fecha').defaultTo(knex.fn.now());
    table.text('detalles').nullable();
  });
};

exports.down = async function down(knex) {
  const exists = await knex.schema.hasTable('logs');
  if (!exists) return;
  await knex.schema.dropTable('logs');
};

exports.up = async function up(knex) {
  const exists = await knex.schema.hasTable('grupos_autorizados');
  if (exists) return;
  await knex.schema.createTable('grupos_autorizados', function(table) {
    table.increments('id').primary();
    table.string('jid').notNullable().unique();
    table.string('nombre').notNullable();
    table.string('tipo').notNullable();
    table.string('proveedor').defaultTo('General');
    table.integer('min_messages').defaultTo(100);
    table.integer('max_warnings').defaultTo(3);
    table.boolean('enable_warnings').defaultTo(true);
    table.boolean('enable_restriction').defaultTo(true);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTableIfExists('grupos_autorizados');
};

exports.up = function(knex) {
  return knex.schema.createTable('logs', function(table) {
    table.increments('id').primary();
    table.string('tipo').notNullable();
    table.string('comando').notNullable();
    table.string('usuario').notNullable();
    table.string('grupo').nullable();
    table.timestamp('fecha').defaultTo(knex.fn.now());
    table.text('detalles').nullable();
  });
};

exports.down = function(knex) {
  return knex.schema.dropTableIfExists('logs');
};

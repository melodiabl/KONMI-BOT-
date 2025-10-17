/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
  // Check if table exists
  const hasTable = await knex.schema.hasTable('aportes');

  if (!hasTable) {
    // Create the table if it doesn't exist
    await knex.schema.createTable('aportes', (table) => {
      table.increments('id').primary();
      table.string('usuario').notNullable();
      table.string('grupo').nullable();
      table.string('tipo').notNullable();
      table.text('contenido').notNullable();
      table.text('descripcion').defaultTo('');
      table.text('archivo_path').nullable();
      table.string('estado').defaultTo('pendiente');
      table.string('fuente').defaultTo('');
      table.text('metadata').nullable();
      table.string('fecha').notNullable();
      table.string('updated_at').notNullable();
    });

    // Create indexes
    await knex.schema.raw('CREATE INDEX idx_aporte_usuario ON aportes(usuario)');
    await knex.schema.raw('CREATE INDEX idx_aporte_grupo ON aportes(grupo)');
    await knex.schema.raw('CREATE INDEX idx_aporte_estado ON aportes(estado)');
    await knex.schema.raw('CREATE INDEX idx_aporte_fecha ON aportes(fecha)');
  } else {
    // Table exists, check and add missing columns
    const columns = await knex('aportes').columnInfo();

    // Add missing columns
    await knex.schema.alterTable('aportes', (table) => {
      if (!columns.usuario) table.string('usuario').notNullable();
      if (!columns.grupo) table.string('grupo').nullable();
      if (!columns.tipo) table.string('tipo').notNullable();
      if (!columns.contenido) table.text('contenido').notNullable();
      if (!columns.descripcion) table.text('descripcion').defaultTo('');
      if (!columns.archivo_path) table.text('archivo_path').nullable();
      if (!columns.estado) table.string('estado').defaultTo('pendiente');
      if (!columns.fuente) table.string('fuente').defaultTo('');
      if (!columns.metadata) table.text('metadata').nullable();
      if (!columns.fecha) table.string('fecha').notNullable();
      if (!columns.updated_at) table.string('updated_at').notNullable();
    });
  }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  // We don't want to drop the table in case of rollback
  // as it might contain important data
  return Promise.resolve();
};

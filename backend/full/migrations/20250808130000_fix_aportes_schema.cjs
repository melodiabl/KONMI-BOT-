/**
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function up(knex) {
  const hasTable = await knex.schema.hasTable('aportes');

  // If table doesn't exist, create with the correct schema directly
  if (!hasTable) {
    await knex.schema.createTable('aportes', (table) => {
      table.increments('id').primary();
      table.string('contenido').notNullable();
      table.string('tipo');
      table.string('usuario');
      table.string('grupo');
      table.timestamp('fecha').defaultTo(knex.fn.now());
    });
    return;
  }

  // Check columns
  const hasContenido = await knex.schema.hasColumn('aportes', 'contenido');
  const hasFecha = await knex.schema.hasColumn('aportes', 'fecha');
  const hasGrupo = await knex.schema.hasColumn('aportes', 'grupo');

  // If already aligned, ensure missing 'grupo' column exists and exit
  if (hasContenido && hasFecha) {
    if (!hasGrupo) {
      await knex.schema.alterTable('aportes', (table) => {
        table.string('grupo');
      });
    }
    return;
  }

  // Recreate aportes with the expected schema and migrate data safely
  await knex.schema.createTable('aportes_tmp', (table) => {
    table.increments('id').primary();
    table.string('contenido').notNullable();
    table.string('tipo');
    table.string('usuario');
    table.string('grupo');
    table.timestamp('fecha').defaultTo(knex.fn.now());
  });

  // Attempt to migrate data from old structure (titulo, fecha_aporte)
  try {
    // Use COALESCE to be resilient if some columns are missing
    await knex.raw(`
      INSERT INTO aportes_tmp (id, contenido, tipo, usuario, grupo, fecha)
      SELECT 
        id,
        COALESCE(titulo, contenido) AS contenido,
        tipo,
        usuario,
        NULL AS grupo,
        COALESCE(fecha, fecha_aporte, CURRENT_TIMESTAMP) AS fecha
      FROM aportes
    `);
  } catch (e) {
    // If insertion fails (e.g., old table empty or columns missing), ignore
  }

  await knex.schema.dropTable('aportes');
  await knex.schema.renameTable('aportes_tmp', 'aportes');
};

/**
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function down(knex) {
  const hasTable = await knex.schema.hasTable('aportes');
  if (!hasTable) return;

  // Recreate previous shape (best-effort)
  await knex.schema.createTable('aportes_old', (table) => {
    table.increments('id').primary();
    table.string('titulo').notNullable();
    table.string('tipo');
    table.string('usuario');
    table.string('archivo');
    table.timestamp('fecha_aporte').defaultTo(knex.fn.now());
  });

  try {
    await knex.raw(`
      INSERT INTO aportes_old (id, titulo, tipo, usuario, archivo, fecha_aporte)
      SELECT 
        id,
        contenido AS titulo,
        tipo,
        usuario,
        NULL AS archivo,
        fecha AS fecha_aporte
      FROM aportes
    `);
  } catch (e) {
    // ignore
  }

  await knex.schema.dropTable('aportes');
  await knex.schema.renameTable('aportes_old', 'aportes');
};

/**
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function up(knex) {
  const hasTable = await knex.schema.hasTable('aportes');
  if (!hasTable) return;

  const ensure = async (name, cb) => {
    const exists = await knex.schema.hasColumn('aportes', name);
    if (!exists) {
      await knex.schema.alterTable('aportes', (t) => cb(t));
    }
  };

  await ensure('estado', (t) => t.string('estado'));
  await ensure('procesado_por', (t) => t.string('procesado_por'));
  await ensure('fecha_procesado', (t) => t.timestamp('fecha_procesado'));

  // Backfill defaults
  try {
    await knex('aportes').whereNull('estado').update({ estado: 'pendiente' });
  } catch (e) {}
};

/**
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function down() {
  // No-op
};


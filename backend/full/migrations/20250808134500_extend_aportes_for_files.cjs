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

  await ensure('manhwa_titulo', (t) => t.string('manhwa_titulo'));
  await ensure('archivo_path', (t) => t.string('archivo_path'));
};

/**
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function down(knex) {
  // No-op (SQLite drop column es complejo). Mantener forward-only.
};


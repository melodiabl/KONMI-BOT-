/**
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function up(knex) {
  const hasTable = await knex.schema.hasTable('votaciones');
  if (!hasTable) return;
  const exists = await knex.schema.hasColumn('votaciones', 'grupo_jid');
  if (!exists) {
    await knex.schema.alterTable('votaciones', (t) => {
      t.string('grupo_jid');
    });
  }
};

/**
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function down() {
  // No-op (SQLite drop column is non-trivial)
};






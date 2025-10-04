/**
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function up(knex) {
  const has = await knex.schema.hasTable('manhwas');
  if (!has) return;

  const ensure = async (name, cb) => {
    const exists = await knex.schema.hasColumn('manhwas', name);
    if (!exists) {
      await knex.schema.alterTable('manhwas', (t) => cb(t));
    }
  };

  await ensure('cover_path', (t) => t.string('cover_path'));
  await ensure('created_at', (t) => t.timestamp('created_at').defaultTo(knex.fn.now()));
};

/**
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function down(knex) {
  // no-op: mantener forward-only para SQLite
};

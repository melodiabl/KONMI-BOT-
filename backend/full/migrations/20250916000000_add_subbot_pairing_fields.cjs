exports.up = async function(knex) {
  const hasPairing = await knex.schema.hasColumn('subbots', 'pairing_code');
  if (!hasPairing) {
    await knex.schema.alterTable('subbots', (t) => {
      t.string('pairing_code');
      t.string('qr_path');
      t.text('qr_data');
    });
  }
};

exports.down = async function(knex) {
  const hasPairing = await knex.schema.hasColumn('subbots', 'pairing_code');
  if (hasPairing) {
    await knex.schema.alterTable('subbots', (t) => {
      t.dropColumn('pairing_code');
      t.dropColumn('qr_path');
      t.dropColumn('qr_data');
    });
  }
};

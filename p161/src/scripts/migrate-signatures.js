const pool = require('../db');

const migrateDatabase = async () => {
  const client = await pool.connect();
  try {
    console.log('Migrating database - adding signatures table...');

    await client.query(`
      CREATE TABLE IF NOT EXISTS signatures (
        id SERIAL PRIMARY KEY,
        signed_key_id INTEGER REFERENCES keys(id) ON DELETE CASCADE,
        signer_key_id VARCHAR(16) NOT NULL,
        signer_fingerprint VARCHAR(40),
        signature_type INTEGER,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        signed_at TIMESTAMP,
        UNIQUE(signed_key_id, signer_key_id)
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_signatures_signed_key ON signatures(signed_key_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_signatures_signer_key ON signatures(signer_key_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_signatures_signer_fingerprint ON signatures(signer_fingerprint)
    `);

    console.log('Signatures table created successfully!');
    console.log('Migration completed successfully!');
  } catch (err) {
    console.error('Error migrating database:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
};

migrateDatabase();

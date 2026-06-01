const pool = require('../db');

const initDatabase = async () => {
  const client = await pool.connect();
  try {
    console.log('Initializing database...');

    await client.query(`
      CREATE TABLE IF NOT EXISTS keys (
        id SERIAL PRIMARY KEY,
        fingerprint VARCHAR(40) UNIQUE NOT NULL,
        key_id VARCHAR(16) NOT NULL,
        public_key TEXT NOT NULL,
        algorithm INTEGER,
        key_size INTEGER,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP,
        revoked BOOLEAN DEFAULT FALSE
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS user_ids (
        id SERIAL PRIMARY KEY,
        key_id INTEGER REFERENCES keys(id) ON DELETE CASCADE,
        name TEXT,
        email TEXT,
        comment TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(key_id, name, email, comment)
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_keys_fingerprint ON keys(fingerprint)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_keys_key_id ON keys(key_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_user_ids_name ON user_ids(name)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_user_ids_email ON user_ids(email)
    `);

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

    console.log('Database initialized successfully!');
  } catch (err) {
    console.error('Error initializing database:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
};

initDatabase();

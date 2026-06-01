const pool = require('../db');

const migrateDatabase = async () => {
  const client = await pool.connect();
  try {
    console.log('Migrating database fields to TEXT type...');

    await client.query(`
      ALTER TABLE user_ids 
      ALTER COLUMN name TYPE TEXT,
      ALTER COLUMN email TYPE TEXT,
      ALTER COLUMN comment TYPE TEXT
    `);

    console.log('Migration completed successfully!');
    console.log('user_ids table columns (name, email, comment) changed to TEXT type');
  } catch (err) {
    console.error('Error migrating database:', err);
    if (err.message && err.message.includes('already of type')) {
      console.log('Columns are already of TEXT type, no migration needed.');
    } else {
      process.exit(1);
    }
  } finally {
    client.release();
    await pool.end();
  }
};

migrateDatabase();

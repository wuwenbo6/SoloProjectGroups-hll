import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, '../../data/app.db');
const dbDir = path.dirname(dbPath);

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function runMigrations() {
  const migrationsDir = path.join(__dirname, '../../migrations');
  const migrationFiles = fs.readdirSync(migrationsDir).sort();

  for (const file of migrationFiles) {
    const migrationPath = path.join(migrationsDir, file);
    const migrationSql = fs.readFileSync(migrationPath, 'utf-8');
    db.exec(migrationSql);
  }
}

try {
  runMigrations();
} catch (error) {
  console.error('Migrations failed:', error);
  process.exit(1);
}

export default db;

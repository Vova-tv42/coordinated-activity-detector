import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import Database from 'better-sqlite3';
import { type BetterSQLite3Database, drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from './schema';

const LOCAL_DATABASE_PATH = './data/local.db';

export function resolveDatabasePath() {
  return process.env.DATABASE_PATH ?? LOCAL_DATABASE_PATH;
}

export function openDatabase(databasePath: string) {
  mkdirSync(dirname(databasePath), { recursive: true });

  const sqlite = new Database(databasePath);
  sqlite.pragma('journal_mode = WAL');
  // SQLite ignores foreign keys and ON DELETE CASCADE unless enabled on every connection
  sqlite.pragma('foreign_keys = ON');

  return drizzle({ client: sqlite, schema, casing: 'snake_case' });
}

const globalForDatabase = globalThis as typeof globalThis & {
  database?: BetterSQLite3Database<typeof schema>;
};

export function getDatabase() {
  globalForDatabase.database ??= openDatabase(resolveDatabasePath());
  return globalForDatabase.database;
}

export function migrateDatabase() {
  migrate(getDatabase(), { migrationsFolder: join(process.cwd(), 'drizzle') });
}

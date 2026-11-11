import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { openDatabase } from '@/db/connection';

export const MIGRATIONS_FOLDER = join(process.cwd(), 'drizzle');
export const TEST_DATA_PATH = join(process.cwd(), 'src/db/test-data.sql');

type TestDatabaseOptions = {
  databasePath?: string;
  withTestData?: boolean;
};

export function createTestDatabase({
  databasePath = ':memory:',
  withTestData = false,
}: TestDatabaseOptions = {}) {
  const database = openDatabase(databasePath);
  migrate(database, { migrationsFolder: MIGRATIONS_FOLDER });

  if (withTestData) {
    database.$client.exec(readFileSync(TEST_DATA_PATH, 'utf8'));
  }

  return database;
}

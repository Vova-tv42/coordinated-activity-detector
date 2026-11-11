import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MIGRATIONS_FOLDER, TEST_DATA_PATH } from '@/db/test-database';

const STATEMENT_BREAKPOINT = '--> statement-breakpoint';

type MigrationJournal = { entries: { tag: string }[] };

const journal: MigrationJournal = JSON.parse(
  readFileSync(join(MIGRATIONS_FOLDER, 'meta/_journal.json'), 'utf8'),
);

const migrationScripts = journal.entries.map(({ tag }) => {
  const migrationSql = readFileSync(join(MIGRATIONS_FOLDER, `${tag}.sql`), 'utf8')
    .replaceAll(STATEMENT_BREAKPOINT, '')
    .trim();
  return `-- Migration ${tag}\n${migrationSql}`;
});

const testData = readFileSync(TEST_DATA_PATH, 'utf8').trim();

process.stdout.write(`${[...migrationScripts, testData].join('\n\n')}\n`);

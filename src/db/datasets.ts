import type { AppDatabase } from '@/db/connection';

export type DatasetValue = string | number | null;
export type DatasetRow = Record<string, DatasetValue>;
export type Dataset = Record<string, DatasetRow[]>;

// Master tables go first, so every foreign key of a details row points to an already inserted row
const TABLES_FROM_MASTER_TO_DETAILS = [
  'detection_profiles',
  'sources',
  'participants',
  'messages',
  'snapshots',
  'snapshot_groups',
  'group_members',
  'pair_signals',
  'evidence',
  'findings',
  'finding_members',
  'window_metrics',
  'admins',
];

type TableColumnInfo = { name: string; pk: number };

function insertRow(database: AppDatabase, tableName: string, row: DatasetRow) {
  const columnNames = Object.keys(row);
  const columnList = columnNames.map((columnName) => `"${columnName}"`).join(', ');
  const parameterList = columnNames.map((columnName) => `@${columnName}`).join(', ');
  database.$client
    .prepare(`INSERT INTO "${tableName}" (${columnList}) VALUES (${parameterList})`)
    .run(row);
}

export function loadDataset(database: AppDatabase, dataset: Dataset) {
  const unknownTableNames = Object.keys(dataset).filter(
    (tableName) => !TABLES_FROM_MASTER_TO_DETAILS.includes(tableName),
  );
  if (unknownTableNames.length > 0) {
    throw new Error(`Unknown tables in dataset: ${unknownTableNames.join(', ')}`);
  }

  const insertAllRows = database.$client.transaction(() => {
    for (const tableName of TABLES_FROM_MASTER_TO_DETAILS) {
      for (const row of dataset[tableName] ?? []) {
        insertRow(database, tableName, row);
      }
    }
  });
  insertAllRows();
}

function findPrimaryKeyColumns(database: AppDatabase, tableName: string) {
  const columns = database.$client
    .prepare(`PRAGMA table_info("${tableName}")`)
    .all() as TableColumnInfo[];
  return columns
    .filter((column) => column.pk > 0)
    .sort((columnA, columnB) => columnA.pk - columnB.pk)
    .map((column) => column.name);
}

export function readTables(database: AppDatabase, tableNames: string[]): Dataset {
  return Object.fromEntries(
    tableNames.map((tableName) => {
      const orderByList = findPrimaryKeyColumns(database, tableName)
        .map((columnName) => `"${columnName}"`)
        .join(', ');
      const rows = database.$client
        .prepare(`SELECT * FROM "${tableName}" ORDER BY ${orderByList}`)
        .all() as DatasetRow[];
      return [tableName, rows];
    }),
  );
}

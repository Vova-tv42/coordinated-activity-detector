import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AppDatabase } from '@/db/connection';
import { createTestDatabase } from '@/db/test-database';

type ColumnInfo = {
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
};
type IndexInfo = { name: string; unique: number };
type ForeignKeyInfo = { table: string; from: string; to: string; on_delete: string };

const ALL_TABLES = [
  'admins',
  'detection_profiles',
  'evidence',
  'finding_members',
  'findings',
  'group_members',
  'messages',
  'pair_signals',
  'participants',
  'snapshot_groups',
  'snapshots',
  'sources',
  'window_metrics',
];

describe('структура бази даних', () => {
  let database: AppDatabase;

  function sqlite() {
    return database.$client;
  }

  function columnsOf(table: string) {
    return sqlite().prepare(`PRAGMA table_info(${table})`).all() as ColumnInfo[];
  }

  function foreignKeysOf(table: string) {
    return sqlite().prepare(`PRAGMA foreign_key_list(${table})`).all() as ForeignKeyInfo[];
  }

  function uniqueIndexesOf(table: string) {
    const indexes = sqlite().prepare(`PRAGMA index_list(${table})`).all() as IndexInfo[];
    return indexes.filter((index) => index.unique === 1).map((index) => index.name);
  }

  function countRows(table: string) {
    return (sqlite().prepare(`SELECT count(*) AS total FROM ${table}`).get() as { total: number })
      .total;
  }

  beforeEach(() => {
    database = createTestDatabase({ withTestData: true });
  });

  afterEach(() => {
    database.$client.close();
  });

  describe('таблиці і поля', () => {
    it('після міграцій існують усі 13 таблиць моделі даних', () => {
      const tables = sqlite()
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle%' ORDER BY name",
        )
        .all()
        .map((row) => (row as { name: string }).name);

      expect(tables).toEqual(ALL_TABLES);
    });

    it('повідомлення має всі поля, обовʼязкові поля NOT NULL, а tg_message_id необовʼязковий', () => {
      const columns = columnsOf('messages');

      expect(columns.map((column) => column.name)).toEqual([
        'id',
        'source_id',
        'participant_id',
        'tg_message_id',
        'sent_at',
        'text',
        'normalized_text',
      ]);
      expect(columns.find((column) => column.name === 'id')?.pk).toBe(1);
      expect(columns.find((column) => column.name === 'tg_message_id')?.notnull).toBe(0);
      expect(
        columns
          .filter((column) => column.name !== 'tg_message_id')
          .every((column) => column.notnull === 1),
      ).toBe(true);
    });

    it('числові параметри профілю зберігаються як цілі числа і дроби', () => {
      const types = Object.fromEntries(
        columnsOf('detection_profiles').map((column) => [column.name, column.type]),
      );

      expect(types).toMatchObject({
        sync_gap_sec: 'INTEGER',
        window_minutes: 'INTEGER',
        sim_threshold: 'REAL',
        w_text: 'REAL',
        edge_threshold: 'REAL',
      });
    });

    it('нове джерело активне, а новий учасник має нуль повідомлень за замовчуванням', () => {
      const isActiveColumn = columnsOf('sources').find((column) => column.name === 'is_active');
      const messageCountColumn = columnsOf('participants').find(
        (column) => column.name === 'message_count',
      );

      expect(isActiveColumn?.dflt_value).toBe('true');
      expect(messageCountColumn?.dflt_value).toBe('0');
    });

    it('відхиляє рядок без обовʼязкового поля', () => {
      expect(() =>
        sqlite()
          .prepare(
            "INSERT INTO sources (kind, profile_id, is_active, created_at) VALUES ('upload', 1, 1, 0)",
          )
          .run(),
      ).toThrow(/NOT NULL constraint failed: sources.title/);
    });
  });

  describe('унікальність', () => {
    it.each([
      ['sources', 'sources_tg_chat_id_unique'],
      ['participants', 'participants_source_id_external_id_unique'],
      ['messages', 'messages_source_id_tg_message_id_unique'],
      ['admins', 'admins_email_unique'],
      ['detection_profiles', 'detection_profiles_name_unique'],
    ])('таблиця %s має унікальний індекс %s', (table, indexName) => {
      expect(uniqueIndexesOf(table)).toContain(indexName);
    });

    it('не дає зареєструвати ту саму групу Telegram двічі', () => {
      expect(() =>
        sqlite()
          .prepare(
            "INSERT INTO sources (kind, tg_chat_id, title, profile_id, is_active, created_at) VALUES ('telegram', -100123, 'Дубль', 1, 1, 0)",
          )
          .run(),
      ).toThrow(/UNIQUE constraint failed: sources.tg_chat_id/);
    });

    it('не зберігає повторно доставлене повідомлення Telegram', () => {
      expect(() =>
        sqlite()
          .prepare(
            "INSERT INTO messages (source_id, participant_id, tg_message_id, sent_at, text, normalized_text) VALUES (1, 1, 1, 0, 'повтор', 'повтор')",
          )
          .run(),
      ).toThrow(/UNIQUE constraint failed/);
    });
  });

  describe('звʼязки master-details', () => {
    it('описує дії зовнішніх ключів згідно з бізнес-правилами', () => {
      expect(foreignKeysOf('sources')).toEqual([
        expect.objectContaining({
          table: 'detection_profiles',
          from: 'profile_id',
          on_delete: 'NO ACTION',
        }),
      ]);
      expect(foreignKeysOf('messages')).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ table: 'sources', from: 'source_id', on_delete: 'CASCADE' }),
          expect.objectContaining({
            table: 'participants',
            from: 'participant_id',
            on_delete: 'CASCADE',
          }),
        ]),
      );
      expect(foreignKeysOf('findings')).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            table: 'snapshot_groups',
            from: 'snapshot_group_id',
            on_delete: 'SET NULL',
          }),
        ]),
      );
    });

    it('ланцюжок джерело - учасник - повідомлення: видалення джерела видаляє всі залежні дані', () => {
      sqlite().prepare('DELETE FROM sources WHERE id = 1').run();

      expect(countRows('participants')).toBe(1);
      expect(countRows('messages')).toBe(1);
      expect(countRows('snapshots')).toBe(0);
      expect(countRows('pair_signals')).toBe(0);
      expect(countRows('evidence')).toBe(0);
      expect(countRows('findings')).toBe(0);
      expect(countRows('window_metrics')).toBe(0);
    });

    it('ланцюжок снапшот - група - члени групи: видалення снапшота лишає журнал знахідок', () => {
      sqlite().prepare('DELETE FROM snapshots WHERE id = 1').run();

      expect(countRows('snapshot_groups')).toBe(0);
      expect(countRows('group_members')).toBe(0);
      expect(countRows('pair_signals')).toBe(0);
      expect(countRows('evidence')).toBe(0);
      expect(sqlite().prepare('SELECT snapshot_group_id FROM findings WHERE id = 1').get()).toEqual(
        {
          snapshot_group_id: null,
        },
      );
      expect(countRows('finding_members')).toBe(2);
    });

    it('не дає видалити профіль, яким користується джерело', () => {
      expect(() => sqlite().prepare('DELETE FROM detection_profiles WHERE id = 2').run()).toThrow(
        /FOREIGN KEY constraint failed/,
      );
    });

    it('відхиляє повідомлення неіснуючого учасника', () => {
      expect(() =>
        sqlite()
          .prepare(
            "INSERT INTO messages (source_id, participant_id, sent_at, text, normalized_text) VALUES (1, 999, 0, 'текст', 'текст')",
          )
          .run(),
      ).toThrow(/FOREIGN KEY constraint failed/);
    });

    it('тестові дані не порушують жодного зовнішнього ключа', () => {
      expect(sqlite().pragma('foreign_key_check')).toEqual([]);
    });
  });
});

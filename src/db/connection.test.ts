import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from '@/db/connection';
import { detectionProfiles, messages, participants, sources } from '@/db/schema';

describe('openDatabase', () => {
  let temporaryDirectory: string;
  let database: ReturnType<typeof openDatabase>;

  beforeEach(() => {
    temporaryDirectory = mkdtempSync(join(tmpdir(), 'coordination-db-'));
    database = openDatabase(join(temporaryDirectory, 'nested', 'test.db'));
    migrate(database, { migrationsFolder: './drizzle' });
  });

  afterEach(() => {
    database.$client.close();
    rmSync(temporaryDirectory, { recursive: true, force: true });
  });

  it('вмикає зовнішні ключі та режим WAL', () => {
    expect(database.$client.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(database.$client.pragma('journal_mode', { simple: true })).toBe('wal');
  });

  it('після міграції на чистій БД є профіль зі значеннями за замовчуванням', () => {
    const profiles = database.select().from(detectionProfiles).all();

    expect(profiles).toEqual([
      {
        id: 1,
        name: 'Стандартний',
        syncGapSec: 60,
        windowMinutes: 30,
        windowMaxMessages: 500,
        minTextLength: 12,
        simThreshold: 0.6,
        wText: 0.5,
        wCoactivity: 0.3,
        wCosharing: 0.2,
        edgeThreshold: 0.5,
        keepThreshold: 0.2,
      },
    ]);
  });

  it('видалення джерела каскадно видаляє його учасників і повідомлення', () => {
    const [source] = database
      .insert(sources)
      .values({ kind: 'upload', title: 'Демо-чат', profileId: 1 })
      .returning()
      .all();
    const [participant] = database
      .insert(participants)
      .values({
        sourceId: source.id,
        externalId: 'alice',
        displayName: 'alice',
        firstSeenAt: new Date(),
      })
      .returning()
      .all();
    database
      .insert(messages)
      .values({
        sourceId: source.id,
        participantId: participant.id,
        sentAt: new Date(),
        text: 'Привіт',
        normalizedText: 'привіт',
      })
      .run();

    database.delete(sources).where(eq(sources.id, source.id)).run();

    expect(database.select().from(participants).all()).toEqual([]);
    expect(database.select().from(messages).all()).toEqual([]);
  });

  it('не дозволяє джерело з неіснуючим профілем', () => {
    const insertSourceWithMissingProfile = () =>
      database.insert(sources).values({ kind: 'upload', title: 'Демо-чат', profileId: 999 }).run();

    expect(insertSourceWithMissingProfile).toThrow(/FOREIGN KEY/);
  });
});

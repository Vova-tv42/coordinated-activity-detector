import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type AppDatabase, openDatabase } from '@/db/connection';
import { type IncomingMessage, saveIncomingMessage } from '@/db/ingest';
import { sources } from '@/db/schema';
import { findSource, listRecentMessages, listSourcesWithCounts } from '@/db/sources';

describe('sources', () => {
  let database: AppDatabase;

  function createSource(title: string, kind: 'telegram' | 'upload' = 'telegram') {
    return database.insert(sources).values({ kind, title, profileId: 1 }).returning().get().id;
  }

  function saveMessage(message: Partial<IncomingMessage> & { sourceId: number }) {
    saveIncomingMessage(database, {
      externalId: '42',
      displayName: 'Alice',
      sentAt: new Date('2026-09-10T12:00:00Z'),
      text: 'Привіт усім у групі',
      ...message,
    });
  }

  beforeEach(() => {
    database = openDatabase(':memory:');
    migrate(database, { migrationsFolder: './drizzle' });
  });

  afterEach(() => {
    database.$client.close();
  });

  describe('listSourcesWithCounts', () => {
    it('рахує учасників і повідомлення кожного джерела окремо', () => {
      const groupId = createSource('Тестова група');
      const demoId = createSource('Демо-чат', 'upload');
      saveMessage({ sourceId: groupId, externalId: '1', tgMessageId: 1 });
      saveMessage({ sourceId: groupId, externalId: '1', tgMessageId: 2 });
      saveMessage({ sourceId: groupId, externalId: '2', tgMessageId: 3 });
      saveMessage({ sourceId: demoId, externalId: 'bob' });

      const sourceList = listSourcesWithCounts(database);

      expect(sourceList).toContainEqual(
        expect.objectContaining({ id: groupId, participantCount: 2, messageCount: 3 }),
      );
      expect(sourceList).toContainEqual(
        expect.objectContaining({
          id: demoId,
          kind: 'upload',
          participantCount: 1,
          messageCount: 1,
        }),
      );
    });

    it('показує нулі для джерела без повідомлень', () => {
      const emptyId = createSource('Порожня група');

      expect(listSourcesWithCounts(database)).toEqual([
        {
          id: emptyId,
          title: 'Порожня група',
          kind: 'telegram',
          isActive: true,
          participantCount: 0,
          messageCount: 0,
        },
      ]);
    });

    it('повертає порожній список, якщо джерел немає', () => {
      expect(listSourcesWithCounts(database)).toEqual([]);
    });
  });

  describe('findSource', () => {
    it('знаходить джерело за id', () => {
      const groupId = createSource('Тестова група');

      expect(findSource(database, groupId)).toEqual({
        id: groupId,
        title: 'Тестова група',
        kind: 'telegram',
      });
    });

    it('повертає undefined для неіснуючого id', () => {
      expect(findSource(database, 999)).toBeUndefined();
    });
  });

  describe('listRecentMessages', () => {
    it('повертає найновіші повідомлення першими з іменем автора', () => {
      const groupId = createSource('Тестова група');
      saveMessage({
        sourceId: groupId,
        tgMessageId: 1,
        text: 'Перше повідомлення',
        sentAt: new Date('2026-09-10T12:00:00Z'),
      });
      saveMessage({
        sourceId: groupId,
        externalId: '7',
        displayName: 'Bob',
        tgMessageId: 2,
        text: 'Друге повідомлення',
        sentAt: new Date('2026-09-10T12:05:00Z'),
      });

      const recentMessages = listRecentMessages(database, groupId, 10);

      expect(recentMessages.map(({ text, authorName }) => ({ text, authorName }))).toEqual([
        { text: 'Друге повідомлення', authorName: 'Bob' },
        { text: 'Перше повідомлення', authorName: 'Alice' },
      ]);
    });

    it('обмежує кількість повідомлень і не бере чужі джерела', () => {
      const groupId = createSource('Тестова група');
      const otherId = createSource('Інша група');
      for (let messageNumber = 1; messageNumber <= 5; messageNumber++) {
        saveMessage({
          sourceId: groupId,
          tgMessageId: messageNumber,
          sentAt: new Date(Date.UTC(2026, 8, 10, 12, messageNumber)),
        });
      }
      saveMessage({ sourceId: otherId, tgMessageId: 1, text: 'Чуже повідомлення' });

      const recentMessages = listRecentMessages(database, groupId, 3);

      expect(recentMessages).toHaveLength(3);
      expect(recentMessages.map((message) => message.text)).not.toContain('Чуже повідомлення');
    });
  });
});

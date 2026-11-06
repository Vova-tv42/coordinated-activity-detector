import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type AppDatabase, openDatabase } from '@/db/connection';
import { findTelegramSourceId, type IncomingMessage, saveIncomingMessage } from '@/db/ingest';
import { messages, participants, sources } from '@/db/schema';

const TEST_CHAT_ID = -100123;

describe('ingest', () => {
  let database: AppDatabase;
  let sourceId: number;

  function createMessage(overrides: Partial<IncomingMessage> = {}): IncomingMessage {
    return {
      sourceId,
      externalId: '42',
      displayName: 'Alice',
      tgMessageId: 1,
      sentAt: new Date('2026-09-10T12:00:00Z'),
      text: 'Привіт, як справи?',
      ...overrides,
    };
  }

  beforeEach(() => {
    database = openDatabase(':memory:');
    migrate(database, { migrationsFolder: './drizzle' });
    const source = database
      .insert(sources)
      .values({ kind: 'telegram', tgChatId: TEST_CHAT_ID, title: 'Тестова група', profileId: 1 })
      .returning()
      .get();
    sourceId = source.id;
  });

  afterEach(() => {
    database.$client.close();
  });

  describe('saveIncomingMessage', () => {
    it('зберігає оригінальний текст і нормалізований поруч', () => {
      saveIncomingMessage(database, createMessage({ text: 'Привіт, ЯК справи? t.me/news' }));

      const [message] = database.select().from(messages).all();
      expect(message.text).toBe('Привіт, ЯК справи? t.me/news');
      expect(message.normalizedText).toBe('привіт як справи');
    });

    it('створює учасника при першому повідомленні', () => {
      saveIncomingMessage(database, createMessage());

      expect(database.select().from(participants).all()).toEqual([
        {
          id: 1,
          sourceId,
          externalId: '42',
          displayName: 'Alice',
          firstSeenAt: new Date('2026-09-10T12:00:00Z'),
          messageCount: 1,
        },
      ]);
    });

    it('додає наступне повідомлення тому самому учаснику і оновлює його імʼя', () => {
      saveIncomingMessage(database, createMessage());
      saveIncomingMessage(
        database,
        createMessage({
          tgMessageId: 2,
          displayName: 'Alice Smith',
          sentAt: new Date('2026-09-10T12:05:00Z'),
        }),
      );

      const [participant] = database.select().from(participants).all();
      expect(database.select().from(participants).all()).toHaveLength(1);
      expect(participant.messageCount).toBe(2);
      expect(participant.displayName).toBe('Alice Smith');
      expect(participant.firstSeenAt).toEqual(new Date('2026-09-10T12:00:00Z'));
    });

    it('ігнорує повторну доставку того самого повідомлення', () => {
      saveIncomingMessage(database, createMessage());
      saveIncomingMessage(database, createMessage());

      const [participant] = database.select().from(participants).all();
      expect(database.select().from(messages).all()).toHaveLength(1);
      expect(participant.messageCount).toBe(1);
    });

    it('не вважає дублікатами повідомлення без tg_message_id', () => {
      saveIncomingMessage(database, createMessage({ tgMessageId: undefined }));
      saveIncomingMessage(database, createMessage({ tgMessageId: undefined }));

      expect(database.select().from(messages).all()).toHaveLength(2);
    });
  });

  describe('findTelegramSourceId', () => {
    it('знаходить джерело за ідентифікатором чату', () => {
      expect(findTelegramSourceId(database, TEST_CHAT_ID)).toBe(sourceId);
    });

    it('повертає undefined для чату, який не є джерелом', () => {
      expect(findTelegramSourceId(database, -100999)).toBeUndefined();
    });
  });
});

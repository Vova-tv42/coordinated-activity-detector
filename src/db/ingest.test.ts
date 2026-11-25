import { eq } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type AppDatabase, openDatabase } from '@/db/connection';
import {
  findTelegramSourceId,
  type IncomingMessage,
  registerTelegramSource,
  saveIncomingMessage,
  saveUploadedChatLog,
} from '@/db/ingest';
import { detectionProfiles, messages, participants, sources } from '@/db/schema';

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

  describe('saveUploadedChatLog', () => {
    const DEFAULT_PROFILE_ID = 1;

    it('створює джерело типу upload з назвою з файлу і вибраним профілем', () => {
      const uploadedSourceId = saveUploadedChatLog(
        database,
        { sourceName: 'Демо-чат', messages: [] },
        DEFAULT_PROFILE_ID,
      );

      const uploadedSource = database
        .select()
        .from(sources)
        .where(eq(sources.id, uploadedSourceId))
        .get();
      expect(uploadedSource).toMatchObject({
        kind: 'upload',
        title: 'Демо-чат',
        tgChatId: null,
        profileId: DEFAULT_PROFILE_ID,
      });
    });

    it('зберігає повідомлення і рахує учасників за іменем автора', () => {
      const uploadedSourceId = saveUploadedChatLog(
        database,
        {
          sourceName: 'Демо-чат',
          messages: [
            { author: 'bob', at: new Date('2026-09-10T12:02:00Z'), text: 'Друге від bob' },
            { author: 'alice', at: new Date('2026-09-10T12:01:00Z'), text: 'Привіт, СВІТ!' },
            { author: 'bob', at: new Date('2026-09-10T12:00:00Z'), text: 'Перше від bob' },
          ],
        },
        DEFAULT_PROFILE_ID,
      );

      const uploadedParticipants = database
        .select()
        .from(participants)
        .where(eq(participants.sourceId, uploadedSourceId))
        .orderBy(participants.id)
        .all();
      expect(uploadedParticipants).toEqual([
        expect.objectContaining({
          externalId: 'bob',
          displayName: 'bob',
          firstSeenAt: new Date('2026-09-10T12:00:00Z'),
          messageCount: 2,
        }),
        expect.objectContaining({
          externalId: 'alice',
          firstSeenAt: new Date('2026-09-10T12:01:00Z'),
          messageCount: 1,
        }),
      ]);

      const uploadedMessages = database
        .select()
        .from(messages)
        .where(eq(messages.sourceId, uploadedSourceId))
        .orderBy(messages.id)
        .all();
      expect(uploadedMessages).toHaveLength(3);
      expect(uploadedMessages.every((message) => message.tgMessageId === null)).toBe(true);
      expect(uploadedMessages[1]).toMatchObject({
        text: 'Привіт, СВІТ!',
        normalizedText: 'привіт світ',
      });
    });

    it('кожне завантаження створює нове джерело навіть з тією самою назвою', () => {
      const chatLog = {
        sourceName: 'Демо-чат',
        messages: [{ author: 'alice', at: new Date('2026-09-10T12:00:00Z'), text: 'Привіт' }],
      };

      const firstSourceId = saveUploadedChatLog(database, chatLog, DEFAULT_PROFILE_ID);
      const secondSourceId = saveUploadedChatLog(database, chatLog, DEFAULT_PROFILE_ID);

      expect(secondSourceId).not.toBe(firstSourceId);
      expect(database.select().from(messages).all()).toHaveLength(2);
    });

    it('не залишає джерело без повідомлень, якщо профілю не існує', () => {
      const missingProfileId = 999;

      expect(() =>
        saveUploadedChatLog(
          database,
          {
            sourceName: 'Демо-чат',
            messages: [{ author: 'alice', at: new Date('2026-09-10T12:00:00Z'), text: 'Привіт' }],
          },
          missingProfileId,
        ),
      ).toThrow();
      expect(database.select().from(sources).all()).toHaveLength(1);
    });
  });

  describe('registerTelegramSource', () => {
    it('падає з підказкою і не створює джерело, якщо дефолтного профілю немає', () => {
      const databaseWithoutProfile = openDatabase(':memory:');
      migrate(databaseWithoutProfile, { migrationsFolder: './drizzle' });
      // The trigger protects the default profile, so the test drops it to simulate an older database
      databaseWithoutProfile.$client.exec('DROP TRIGGER detection_profiles_keep_default_on_delete');
      databaseWithoutProfile.delete(detectionProfiles).run();

      expect(() =>
        registerTelegramSource(databaseWithoutProfile, { chatId: -100999, title: 'Нова група' }),
      ).toThrow('run migrations');
      expect(databaseWithoutProfile.select().from(sources).all()).toEqual([]);

      databaseWithoutProfile.$client.close();
    });

    it('зберігає налаштований профіль джерела при повторній реєстрації', () => {
      const customProfile = database
        .insert(detectionProfiles)
        .values({
          name: 'Чутливий',
          syncGapSec: 30,
          windowMinutes: 15,
          windowMaxMessages: 200,
          minTextLength: 8,
          simThreshold: 0.5,
          wText: 0.5,
          wCoactivity: 0.3,
          wCosharing: 0.2,
          edgeThreshold: 0.4,
          keepThreshold: 0.1,
        })
        .returning()
        .get();
      database
        .update(sources)
        .set({ profileId: customProfile.id })
        .where(eq(sources.id, sourceId))
        .run();

      const registeredSourceId = registerTelegramSource(database, {
        chatId: TEST_CHAT_ID,
        title: 'Тестова група',
      });

      expect(registeredSourceId).toBe(sourceId);
      expect(database.select().from(sources).get()?.profileId).toBe(customProfile.id);
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

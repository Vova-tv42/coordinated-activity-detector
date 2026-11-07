import type { UserFromGetMe } from 'grammy/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppDatabase } from '@/db/connection';
import { findTelegramSourceId, registerTelegramSource, saveIncomingMessage } from '@/db/ingest';
import { createTelegramWebhookHandler } from '@/telegram/bot';
import * as messageMapping from '@/telegram/message-mapping';

// Mock: the handler is checked in isolation, without writing anything to a database
vi.mock('@/db/ingest', () => ({
  findTelegramSourceId: vi.fn(),
  registerTelegramSource: vi.fn(),
  saveIncomingMessage: vi.fn(),
}));

const SECRET_TOKEN = 'test-secret';
const REGISTERED_SOURCE_ID = 7;

// Dummy: only passed through to the mocked ingest functions, never queried
const dummyDatabase = {} as AppDatabase;

const botInfo: UserFromGetMe = {
  id: 123,
  is_bot: true,
  first_name: 'Test bot',
  username: 'test_bot',
  can_join_groups: true,
  can_read_all_group_messages: true,
  supports_inline_queries: false,
  can_connect_to_business: false,
  has_main_web_app: false,
  has_topics_enabled: false,
  allows_users_to_create_topics: false,
  can_manage_bots: false,
  supports_join_request_queries: false,
};

const groupChat = { id: -100123, type: 'supergroup', title: 'Тестова група' };
const sender = { id: 42, is_bot: false, first_name: 'Alice', last_name: 'Smith' };
const botUser = { id: botInfo.id, is_bot: true, first_name: botInfo.first_name };

function createWebhookRequest(update: object) {
  return new Request('http://localhost/api/telegram/webhook', {
    method: 'POST',
    headers: { 'X-Telegram-Bot-Api-Secret-Token': SECRET_TOKEN },
    body: JSON.stringify(update),
  });
}

function createMessageUpdate(message: object) {
  return {
    update_id: 1,
    message: { message_id: 10, date: 1_757_505_600, chat: groupChat, from: sender, ...message },
  };
}

function createBotMembershipUpdate(chat: object, newStatus: string) {
  return {
    update_id: 2,
    my_chat_member: {
      chat,
      from: sender,
      date: 1_757_505_600,
      old_chat_member: { status: 'left', user: botUser },
      new_chat_member: { status: newStatus, user: botUser },
    },
  };
}

describe('обробники оновлень Telegram без бази даних', () => {
  let handleTelegramUpdate: (request: Request) => Promise<Response>;

  beforeEach(() => {
    handleTelegramUpdate = createTelegramWebhookHandler({
      token: '123:test-token',
      secretToken: SECRET_TOKEN,
      database: dummyDatabase,
      botInfo,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  describe('повідомлення', () => {
    it('зберігає повідомлення з групи-джерела з даними автора', async () => {
      // Stub: pretends the chat is already registered as a source
      vi.mocked(findTelegramSourceId).mockReturnValue(REGISTERED_SOURCE_ID);

      const response = await handleTelegramUpdate(
        createWebhookRequest(createMessageUpdate({ text: 'Привіт усім!' })),
      );

      expect(response.status).toBe(200);
      expect(findTelegramSourceId).toHaveBeenCalledWith(dummyDatabase, groupChat.id);
      expect(saveIncomingMessage).toHaveBeenCalledExactlyOnceWith(dummyDatabase, {
        sourceId: REGISTERED_SOURCE_ID,
        externalId: '42',
        displayName: 'Alice Smith',
        tgMessageId: 10,
        sentAt: new Date(1_757_505_600_000),
        text: 'Привіт усім!',
      });
    });

    it('використовує підпис до фото як текст повідомлення', async () => {
      vi.mocked(findTelegramSourceId).mockReturnValue(REGISTERED_SOURCE_ID);

      await handleTelegramUpdate(
        createWebhookRequest(
          createMessageUpdate({
            photo: [{ file_id: 'photo', file_unique_id: 'photo', width: 90, height: 90 }],
            caption: 'Дивіться, що відбувається',
          }),
        ),
      );

      expect(saveIncomingMessage).toHaveBeenCalledWith(
        dummyDatabase,
        expect.objectContaining({ text: 'Дивіться, що відбувається' }),
      );
    });

    it('не зберігає повідомлення з групи, яка не є джерелом', async () => {
      vi.mocked(findTelegramSourceId).mockReturnValue(undefined);

      const response = await handleTelegramUpdate(
        createWebhookRequest(createMessageUpdate({ text: 'Привіт' })),
      );

      expect(response.ok).toBe(true);
      expect(saveIncomingMessage).not.toHaveBeenCalled();
    });

    it('пропускає стікер ще до пошуку джерела', async () => {
      // Spy: the real mapping runs, the test only watches its result
      const mapTelegramMessageSpy = vi.spyOn(messageMapping, 'mapTelegramMessage');

      const response = await handleTelegramUpdate(
        createWebhookRequest(
          createMessageUpdate({
            sticker: {
              file_id: 'sticker',
              file_unique_id: 'sticker',
              type: 'regular',
              width: 512,
              height: 512,
            },
          }),
        ),
      );

      expect(response.status).toBe(200);
      expect(mapTelegramMessageSpy).toHaveBeenCalledOnce();
      expect(mapTelegramMessageSpy).toHaveReturnedWith(undefined);
      expect(findTelegramSourceId).not.toHaveBeenCalled();
      expect(saveIncomingMessage).not.toHaveBeenCalled();
    });

    it('передає помилку збереження далі, щоб Telegram повторив доставку', async () => {
      vi.mocked(findTelegramSourceId).mockReturnValue(REGISTERED_SOURCE_ID);
      vi.mocked(saveIncomingMessage).mockImplementation(() => {
        throw new Error('database is locked');
      });

      await expect(
        handleTelegramUpdate(createWebhookRequest(createMessageUpdate({ text: 'Привіт' }))),
      ).rejects.toThrow('database is locked');
    });
  });

  describe('додавання бота в групу', () => {
    it.each([
      'member',
      'administrator',
    ])('реєструє групу, коли бот отримує статус %s', async (status) => {
      await handleTelegramUpdate(
        createWebhookRequest(createBotMembershipUpdate(groupChat, status)),
      );

      expect(registerTelegramSource).toHaveBeenCalledWith(dummyDatabase, {
        chatId: -100123,
        title: 'Тестова група',
      });
    });

    it.each(['left', 'kicked'])('не реєструє групу, коли бот отримує статус %s', async (status) => {
      await handleTelegramUpdate(
        createWebhookRequest(createBotMembershipUpdate(groupChat, status)),
      );

      expect(registerTelegramSource).not.toHaveBeenCalled();
    });

    it('ігнорує особистий чат з ботом', async () => {
      const privateChat = { id: 42, type: 'private', first_name: 'Alice' };

      const response = await handleTelegramUpdate(
        createWebhookRequest(createBotMembershipUpdate(privateChat, 'member')),
      );

      expect(response.status).toBe(200);
      expect(registerTelegramSource).toHaveBeenCalledTimes(0);
    });
  });
});

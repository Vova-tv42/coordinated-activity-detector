import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import type { UserFromGetMe } from 'grammy/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type AppDatabase, openDatabase } from '@/db/connection';
import { messages, participants, sources } from '@/db/schema';
import { createTelegramWebhookHandler, readTelegramSettings } from '@/telegram/bot';

const SECRET_TOKEN = 'test-secret';
const SECRET_HEADER = 'X-Telegram-Bot-Api-Secret-Token';

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
const sender = { id: 42, is_bot: false, first_name: 'Alice' };

function createWebhookRequest(update: object, headers: Record<string, string> = {}) {
  return new Request('http://localhost/api/telegram/webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(update),
  });
}

function createTextUpdate(text: string) {
  return {
    update_id: 1,
    message: {
      message_id: 1,
      date: 1_757_505_600,
      chat: groupChat,
      from: sender,
      text,
    },
  };
}

function createBotMembershipUpdate(
  chat: object,
  oldStatus: 'left' | 'member' | 'kicked',
  newStatus: 'left' | 'member' | 'administrator' | 'kicked',
) {
  const botUser = { id: botInfo.id, is_bot: true, first_name: botInfo.first_name };
  return {
    update_id: 2,
    my_chat_member: {
      chat,
      from: sender,
      date: 1_757_505_600,
      old_chat_member: { status: oldStatus, user: botUser },
      new_chat_member: { status: newStatus, user: botUser },
    },
  };
}

describe('createTelegramWebhookHandler', () => {
  let database: AppDatabase;
  let handleTelegramUpdate: (request: Request) => Promise<Response>;

  function registerGroupAsSource() {
    database
      .insert(sources)
      .values({ kind: 'telegram', tgChatId: groupChat.id, title: groupChat.title, profileId: 1 })
      .run();
  }

  beforeEach(() => {
    database = openDatabase(':memory:');
    migrate(database, { migrationsFolder: './drizzle' });
    handleTelegramUpdate = createTelegramWebhookHandler({
      token: '123:test-token',
      secretToken: SECRET_TOKEN,
      database,
      botInfo,
    });
  });

  afterEach(() => {
    database.$client.close();
  });

  it('приймає текстове повідомлення з правильним секретом', async () => {
    const response = await handleTelegramUpdate(
      createWebhookRequest(createTextUpdate('Привіт'), { [SECRET_HEADER]: SECRET_TOKEN }),
    );

    expect(response.status).toBe(200);
  });

  it('зберігає повідомлення із зареєстрованої групи разом з автором', async () => {
    registerGroupAsSource();

    await handleTelegramUpdate(
      createWebhookRequest(createTextUpdate('Привіт, світе!'), { [SECRET_HEADER]: SECRET_TOKEN }),
    );

    const [message] = database.select().from(messages).all();
    const [participant] = database.select().from(participants).all();
    expect(message).toMatchObject({
      tgMessageId: 1,
      sentAt: new Date(1_757_505_600_000),
      text: 'Привіт, світе!',
      normalizedText: 'привіт світе',
    });
    expect(participant).toMatchObject({ externalId: '42', displayName: 'Alice' });
  });

  it('реєструє групу як джерело з дефолтним профілем, коли бота додають у групу', async () => {
    const response = await handleTelegramUpdate(
      createWebhookRequest(createBotMembershipUpdate(groupChat, 'left', 'member'), {
        [SECRET_HEADER]: SECRET_TOKEN,
      }),
    );

    expect(response.status).toBe(200);
    expect(database.select().from(sources).all()).toEqual([
      expect.objectContaining({
        kind: 'telegram',
        tgChatId: groupChat.id,
        title: groupChat.title,
        profileId: 1,
        isActive: true,
      }),
    ]);
  });

  it('після реєстрації групи зберігає її повідомлення', async () => {
    await handleTelegramUpdate(
      createWebhookRequest(createBotMembershipUpdate(groupChat, 'left', 'administrator'), {
        [SECRET_HEADER]: SECRET_TOKEN,
      }),
    );
    await handleTelegramUpdate(
      createWebhookRequest(createTextUpdate('Перше повідомлення'), {
        [SECRET_HEADER]: SECRET_TOKEN,
      }),
    );

    expect(database.select().from(messages).all()).toHaveLength(1);
  });

  it('не створює дубліката при повторному додаванні бота і оновлює назву групи', async () => {
    registerGroupAsSource();
    const renamedGroup = { ...groupChat, title: 'Нова назва групи' };

    await handleTelegramUpdate(
      createWebhookRequest(createBotMembershipUpdate(renamedGroup, 'member', 'administrator'), {
        [SECRET_HEADER]: SECRET_TOKEN,
      }),
    );

    const registeredSources = database.select().from(sources).all();
    expect(registeredSources).toHaveLength(1);
    expect(registeredSources[0].title).toBe('Нова назва групи');
  });

  it('не реєструє джерело, коли бота видаляють з групи', async () => {
    await handleTelegramUpdate(
      createWebhookRequest(createBotMembershipUpdate(groupChat, 'member', 'kicked'), {
        [SECRET_HEADER]: SECRET_TOKEN,
      }),
    );

    expect(database.select().from(sources).all()).toEqual([]);
  });

  it('не реєструє джерело для особистого чату з ботом', async () => {
    const privateChat = { id: 42, type: 'private', first_name: 'Alice' };

    const response = await handleTelegramUpdate(
      createWebhookRequest(createBotMembershipUpdate(privateChat, 'left', 'member'), {
        [SECRET_HEADER]: SECRET_TOKEN,
      }),
    );

    expect(response.status).toBe(200);
    expect(database.select().from(sources).all()).toEqual([]);
  });

  it('не зберігає повідомлення з групи, яка не є джерелом', async () => {
    const response = await handleTelegramUpdate(
      createWebhookRequest(createTextUpdate('Привіт'), { [SECRET_HEADER]: SECRET_TOKEN }),
    );

    expect(response.status).toBe(200);
    expect(database.select().from(messages).all()).toEqual([]);
  });

  it('приймає стікер без тексту, щоб Telegram не надсилав його повторно', async () => {
    registerGroupAsSource();
    const update = {
      update_id: 2,
      message: {
        message_id: 2,
        date: 1_757_505_600,
        chat: groupChat,
        from: sender,
        sticker: {
          file_id: 'sticker',
          file_unique_id: 'sticker',
          type: 'regular',
          width: 512,
          height: 512,
        },
      },
    };

    const response = await handleTelegramUpdate(
      createWebhookRequest(update, { [SECRET_HEADER]: SECRET_TOKEN }),
    );

    expect(response.status).toBe(200);
    expect(database.select().from(messages).all()).toEqual([]);
  });

  it('відхиляє запит з неправильним секретом', async () => {
    const response = await handleTelegramUpdate(
      createWebhookRequest({ update_id: 3 }, { [SECRET_HEADER]: 'wrong-secret' }),
    );

    expect(response.status).toBe(401);
  });

  it('відхиляє запит без секрету', async () => {
    const response = await handleTelegramUpdate(createWebhookRequest({ update_id: 4 }));

    expect(response.status).toBe(401);
  });
});

describe('readTelegramSettings', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('повертає токен і секрет зі змінних середовища', () => {
    vi.stubEnv('TELEGRAM_BOT_TOKEN', '123:token');
    vi.stubEnv('TELEGRAM_WEBHOOK_SECRET', 'secret');

    expect(readTelegramSettings()).toEqual({ token: '123:token', secretToken: 'secret' });
  });

  it('падає з зрозумілою помилкою, якщо секрет не задано', () => {
    vi.stubEnv('TELEGRAM_BOT_TOKEN', '123:token');
    vi.stubEnv('TELEGRAM_WEBHOOK_SECRET', undefined);

    expect(() => readTelegramSettings()).toThrow('TELEGRAM_WEBHOOK_SECRET');
  });
});

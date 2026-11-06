import type { Message } from 'grammy/types';
import { describe, expect, it } from 'vitest';
import { mapTelegramMessage } from '@/telegram/message-mapping';

const TEST_CHAT = {
  id: -100123456789,
  type: 'supergroup' as const,
  title: 'Тестова група',
};

const TEST_DATE_SECONDS = 1_757_505_600;
const EXPECTED_DATE = new Date(TEST_DATE_SECONDS * 1000);

describe('mapTelegramMessage', () => {
  it('мапить текстове повідомлення від користувача з імʼям та прізвищем', () => {
    const rawMessage = {
      message_id: 101,
      date: TEST_DATE_SECONDS,
      chat: TEST_CHAT,
      from: {
        id: 42,
        is_bot: false,
        first_name: 'Іван',
        last_name: 'Франко',
        username: 'franko',
      },
      text: 'Привіт, світе!',
    } as unknown as Message;

    const mappedMessage = mapTelegramMessage(rawMessage);

    expect(mappedMessage).toEqual({
      chatId: TEST_CHAT.id,
      tgMessageId: 101,
      sentAt: EXPECTED_DATE,
      text: 'Привіт, світе!',
      externalId: '42',
      displayName: 'Іван Франко',
    });
  });

  it('мапить повідомлення від користувача лише з імʼям без прізвища', () => {
    const rawMessage = {
      message_id: 102,
      date: TEST_DATE_SECONDS,
      chat: TEST_CHAT,
      from: {
        id: 99,
        is_bot: false,
        first_name: 'Олена',
      },
      text: 'Коротке повідомлення',
    } as unknown as Message;

    const mappedMessage = mapTelegramMessage(rawMessage);

    expect(mappedMessage).toMatchObject({
      externalId: '99',
      displayName: 'Олена',
      text: 'Коротке повідомлення',
    });
  });

  it('мапить повідомлення з підписом замість звичайного тексту (caption)', () => {
    const rawMessage = {
      message_id: 103,
      date: TEST_DATE_SECONDS,
      chat: TEST_CHAT,
      from: {
        id: 42,
        is_bot: false,
        first_name: 'Тарас',
      },
      caption: 'Підпис до зображення',
      photo: [],
    } as unknown as Message;

    const mappedMessage = mapTelegramMessage(rawMessage);

    expect(mappedMessage).toMatchObject({
      tgMessageId: 103,
      text: 'Підпис до зображення',
      displayName: 'Тарас',
    });
  });

  it('мапить повідомлення, надіслане від імені каналу або анонімного адміністратора', () => {
    const rawMessage = {
      message_id: 104,
      date: TEST_DATE_SECONDS,
      chat: TEST_CHAT,
      sender_chat: {
        id: -100987654321,
        type: 'channel' as const,
        title: 'Новини України',
      },
      text: 'Офіційне повідомлення каналу',
    } as unknown as Message;

    const mappedMessage = mapTelegramMessage(rawMessage);

    expect(mappedMessage).toEqual({
      chatId: TEST_CHAT.id,
      tgMessageId: 104,
      sentAt: EXPECTED_DATE,
      text: 'Офіційне повідомлення каналу',
      externalId: '-100987654321',
      displayName: 'Новини України',
    });
  });

  it('повертає undefined для повідомлення без тексту та підпису (стікер, фото без підпису)', () => {
    const stickerMessage = {
      message_id: 105,
      date: TEST_DATE_SECONDS,
      chat: TEST_CHAT,
      from: {
        id: 42,
        is_bot: false,
        first_name: 'Іван',
      },
      sticker: { file_id: 'abc' },
    } as unknown as Message;

    expect(mapTelegramMessage(stickerMessage)).toBeUndefined();
  });

  it('повертає undefined для службового повідомлення без автора', () => {
    const serviceMessage = {
      message_id: 106,
      date: TEST_DATE_SECONDS,
      chat: TEST_CHAT,
      text: 'Користувач приєднався до групи',
    } as unknown as Message;

    expect(mapTelegramMessage(serviceMessage)).toBeUndefined();
  });

  it('повертає undefined, якщо sender_chat має тип private і відсутнє поле from', () => {
    const privateSenderMessage = {
      message_id: 107,
      date: TEST_DATE_SECONDS,
      chat: TEST_CHAT,
      sender_chat: {
        id: 12345,
        type: 'private' as const,
        first_name: 'Приватний',
      },
      text: 'Тест приватного відправника',
    } as unknown as Message;

    expect(mapTelegramMessage(privateSenderMessage)).toBeUndefined();
  });
});

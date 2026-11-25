import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/upload/route';
import { type AppDatabase, getDatabase } from '@/db/connection';
import { messages, sources } from '@/db/schema';
import { createTestDatabase } from '@/db/test-database';
import { MAX_CHAT_LOG_FILE_SIZE_BYTES } from '@/upload/chat-log';

// Fake: the route gets an in-memory SQLite database instead of the file on disk
vi.mock('@/db/connection', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/db/connection')>()),
  getDatabase: vi.fn(),
}));

const DEFAULT_PROFILE_ID = '1';

const validChatLog = {
  sourceName: 'Демо-чат',
  messages: [
    { author: 'alice', at: '2026-09-10T12:00:00Z', text: 'Підписуйтесь на канал' },
    { author: 'bob', at: '2026-09-10T12:00:31Z', text: 'Підписуйтесь на канал!' },
  ],
};

function createUploadRequest(fields: Record<string, string | File>) {
  const formData = new FormData();
  for (const [name, value] of Object.entries(fields)) {
    formData.append(name, value);
  }
  return new Request('http://localhost/api/upload', { method: 'POST', body: formData });
}

function createJsonFile(content: string) {
  return new File([content], 'chat-log.json', { type: 'application/json' });
}

describe('POST /api/upload', () => {
  let database: AppDatabase;

  beforeEach(() => {
    database = createTestDatabase();
    vi.mocked(getDatabase).mockReturnValue(database);
  });

  afterEach(() => {
    database.$client.close();
    vi.clearAllMocks();
  });

  it('зберігає коректний файл як нове джерело і повертає його id', async () => {
    const response = await POST(
      createUploadRequest({
        file: createJsonFile(JSON.stringify(validChatLog)),
        profileId: DEFAULT_PROFILE_ID,
      }),
    );

    const savedSource = database.select().from(sources).get();
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ sourceId: savedSource?.id });
    expect(savedSource).toMatchObject({ kind: 'upload', title: 'Демо-чат', profileId: 1 });
    expect(database.select().from(messages).all()).toHaveLength(2);
  });

  it('повертає помилки валідації українською і нічого не зберігає', async () => {
    const response = await POST(
      createUploadRequest({
        file: createJsonFile(JSON.stringify({ ...validChatLog, sourceName: '' })),
        profileId: DEFAULT_PROFILE_ID,
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ errors: ['Поле "sourceName" не може бути порожнім.'] });
    expect(database.select().from(sources).all()).toEqual([]);
  });

  it('відхиляє файл, який не є JSON', async () => {
    const response = await POST(
      createUploadRequest({ file: createJsonFile('not json'), profileId: DEFAULT_PROFILE_ID }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ errors: ['Файл не є коректним JSON.'] });
  });

  it.each([
    ['без файлу', { profileId: DEFAULT_PROFILE_ID }],
    ['з порожнім файлом', { file: createJsonFile(''), profileId: DEFAULT_PROFILE_ID }],
    ['з текстом замість файлу', { file: 'chat-log.json', profileId: DEFAULT_PROFILE_ID }],
  ])('відхиляє форму %s', async (_, fields) => {
    const response = await POST(createUploadRequest(fields));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      errors: ['Оберіть непорожній JSON-файл з логом чату.'],
    });
  });

  it('відхиляє файл, більший за дозволений розмір', async () => {
    const oversizedContent = ' '.repeat(MAX_CHAT_LOG_FILE_SIZE_BYTES + 1);

    const response = await POST(
      createUploadRequest({
        file: createJsonFile(oversizedContent),
        profileId: DEFAULT_PROFILE_ID,
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ errors: ['Файл більший за 5 МБ.'] });
  });

  it.each([
    ['не вибрано', undefined],
    ['не існує', '999'],
    ['не є числом', 'abc'],
  ])('відхиляє запит, якщо профіль %s', async (_, profileId) => {
    const file = createJsonFile(JSON.stringify(validChatLog));
    const fields: Record<string, string | File> =
      profileId === undefined ? { file } : { file, profileId };

    const response = await POST(createUploadRequest(fields));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ errors: ['Оберіть профіль аналізу зі списку.'] });
    expect(database.select().from(sources).all()).toEqual([]);
  });

  it('відхиляє запит, який не є формою', async () => {
    const response = await POST(
      new Request('http://localhost/api/upload', {
        method: 'POST',
        body: JSON.stringify(validChatLog),
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      errors: ['Запит має містити форму з файлом і профілем.'],
    });
  });
});

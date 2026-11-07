import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type AppDatabase, getDatabase } from '@/db/connection';
import { createTelegramWebhookHandler, readTelegramSettings } from '@/telegram/bot';

// Stub: the route gets a placeholder database object instead of opening SQLite
vi.mock('@/db/connection', () => ({ getDatabase: vi.fn() }));

// Mock: the test controls the settings and the grammY handler the route builds
vi.mock('@/telegram/bot', () => ({
  createTelegramWebhookHandler: vi.fn(),
  readTelegramSettings: vi.fn(),
}));

const TELEGRAM_SETTINGS = { token: '123:test-token', secretToken: 'test-secret' };
const placeholderDatabase = { name: 'placeholder database' } as unknown as AppDatabase;

function createWebhookRequest() {
  return new Request('http://localhost/api/telegram/webhook', {
    method: 'POST',
    body: JSON.stringify({ update_id: 1 }),
  });
}

async function importRoute() {
  // The route caches the handler in module scope, so every test needs a fresh copy of the module
  vi.resetModules();
  return import('@/app/api/telegram/webhook/route');
}

describe('POST /api/telegram/webhook', () => {
  const handleTelegramUpdate = vi.fn<(request: Request) => Promise<Response>>();

  beforeEach(() => {
    handleTelegramUpdate.mockResolvedValue(new Response(null, { status: 200 }));
    vi.mocked(getDatabase).mockReturnValue(placeholderDatabase);
    vi.mocked(readTelegramSettings).mockReturnValue(TELEGRAM_SETTINGS);
    vi.mocked(createTelegramWebhookHandler).mockReturnValue(handleTelegramUpdate);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('передає запит обробнику бота і повертає його відповідь без змін', async () => {
    const { POST } = await importRoute();
    const request = createWebhookRequest();

    const response = await POST(request);

    expect(handleTelegramUpdate).toHaveBeenCalledWith(request);
    expect(response.status).toBe(200);
    expect(response).toBe(await handleTelegramUpdate.mock.results[0].value);
  });

  it('створює обробник з налаштуваннями Telegram і базою даних', async () => {
    const { POST } = await importRoute();

    await POST(createWebhookRequest());

    expect(createTelegramWebhookHandler).toHaveBeenCalledWith({
      token: '123:test-token',
      secretToken: 'test-secret',
      database: placeholderDatabase,
    });
  });

  it('створює обробник лише один раз на процес', async () => {
    const { POST } = await importRoute();

    await POST(createWebhookRequest());
    await POST(createWebhookRequest());
    await POST(createWebhookRequest());

    expect(createTelegramWebhookHandler).toHaveBeenCalledTimes(1);
    expect(getDatabase).toHaveBeenCalledOnce();
    expect(handleTelegramUpdate).toHaveBeenCalledTimes(3);
  });

  it('падає зі зрозумілою помилкою, якщо токен бота не задано', async () => {
    vi.mocked(readTelegramSettings).mockImplementation(() => {
      throw new Error('TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET must be set');
    });
    const { POST } = await importRoute();

    expect(() => POST(createWebhookRequest())).toThrow(/TELEGRAM_BOT_TOKEN/);
    expect(createTelegramWebhookHandler).not.toHaveBeenCalled();
  });

  it('не запамʼятовує невдалий запуск і працює, коли налаштування зʼявились', async () => {
    vi.mocked(readTelegramSettings).mockImplementationOnce(() => {
      throw new Error('TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET must be set');
    });
    const { POST } = await importRoute();

    expect(() => POST(createWebhookRequest())).toThrow();
    const response = await POST(createWebhookRequest());

    expect(response.ok).toBe(true);
    expect(createTelegramWebhookHandler).toHaveBeenCalledOnce();
  });
});

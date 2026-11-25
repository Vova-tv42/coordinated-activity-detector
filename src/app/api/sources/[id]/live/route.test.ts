import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import type { Session } from 'next-auth';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/sources/[id]/live/route';
import { auth } from '@/auth';
import { type AppDatabase, getDatabase, openDatabase } from '@/db/connection';
import { saveIncomingMessage } from '@/db/ingest';
import { sources } from '@/db/schema';
import { analyzeSource } from '@/db/snapshots';

// Stub: the test controls who is logged in instead of a real Google session
vi.mock('@/auth', () => ({ auth: vi.fn() }));

// Fake: the route gets an in-memory SQLite database instead of the file on disk
vi.mock('@/db/connection', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/db/connection')>()),
  getDatabase: vi.fn(),
}));

const OWNER_EMAIL = 'owner@gmail.com';
const mockedAuth = vi.mocked(auth as () => Promise<Session | null>);

function logInAs(email: string | null) {
  const session = email ? { user: { email }, expires: '2026-12-31T00:00:00.000Z' } : null;
  mockedAuth.mockResolvedValue(session);
}

function callLiveEndpoint(id: string) {
  return GET(new Request(`http://localhost/api/sources/${id}/live`), {
    params: Promise.resolve({ id }),
  });
}

describe('GET /api/sources/[id]/live', () => {
  let database: AppDatabase;

  beforeEach(() => {
    database = openDatabase(':memory:');
    migrate(database, { migrationsFolder: './drizzle' });
    vi.mocked(getDatabase).mockReturnValue(database);
    vi.stubEnv('ADMIN_EMAILS', OWNER_EMAIL);
    logInAs(OWNER_EMAIL);
  });

  afterEach(() => {
    database.$client.close();
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('повертає 401 для неавторизованого запиту', async () => {
    logInAs(null);

    const response = await callLiveEndpoint('1');

    expect(response.status).toBe(401);
  });

  it('повертає 401 для користувача без прав адміністратора', async () => {
    logInAs('stranger@gmail.com');

    const response = await callLiveEndpoint('1');

    expect(response.status).toBe(401);
  });

  it('повертає 400 для некоректного ідентифікатора джерела', async () => {
    const invalidResponse = await callLiveEndpoint('abc');
    const zeroResponse = await callLiveEndpoint('0');

    expect(invalidResponse.status).toBe(400);
    expect(zeroResponse.status).toBe(400);
  });

  it('повертає 404, якщо джерело не знайдено', async () => {
    const response = await callLiveEndpoint('999');

    expect(response.status).toBe(404);
  });

  it('повертає дані джерела без снапшота, якщо аналіз ще не запускався', async () => {
    const source = database
      .insert(sources)
      .values({ kind: 'telegram', title: 'Живий чат', profileId: 1 })
      .returning()
      .get();

    const response = await callLiveEndpoint(String(source.id));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(body).toEqual({
      source: {
        id: source.id,
        title: 'Живий чат',
        kind: 'telegram',
        isActive: true,
      },
      thresholds: {
        keepThreshold: expect.any(Number),
        edgeThreshold: expect.any(Number),
      },
      snapshot: null,
      groups: [],
      pairs: [],
      recentMessages: [],
    });
  });

  it('повертає виявлені координовані групи зі скорами та останні повідомлення після аналізу', async () => {
    const source = database
      .insert(sources)
      .values({ kind: 'telegram', title: 'Живий чат', profileId: 1 })
      .returning()
      .get();

    const baseTime = new Date('2026-09-10T12:00:00Z');
    const secondTime = new Date('2026-09-10T12:00:10Z');
    const sharedText = 'Терміново поширюйте це повідомлення серед усіх знайомих';

    saveIncomingMessage(database, {
      sourceId: source.id,
      externalId: '101',
      displayName: 'Alice',
      tgMessageId: 1,
      sentAt: baseTime,
      text: sharedText,
    });
    saveIncomingMessage(database, {
      sourceId: source.id,
      externalId: '102',
      displayName: 'Bob',
      tgMessageId: 2,
      sentAt: secondTime,
      text: sharedText,
    });

    analyzeSource(database, source.id, secondTime);

    const response = await callLiveEndpoint(String(source.id));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.snapshot).toEqual({
      id: expect.any(Number),
      computedAt: secondTime.toISOString(),
    });
    expect(body.groups).toHaveLength(1);
    expect(body.groups[0].memberNames).toEqual(['Alice', 'Bob']);
    expect(body.groups[0].score).toBeGreaterThan(0);
    expect(body.pairs).toHaveLength(1);
    expect(body.recentMessages).toHaveLength(2);
  });
});

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppDatabase } from '@/db/connection';
import { createTestDatabase } from '@/db/test-database';
import { at, copyPasteFarm, type FixtureMessage } from '@/detection/test-fixtures';
import { ANALYSIS_DEBOUNCE_MS } from '@/lib/analysis-trigger';

const BOT_TOKEN = '123:integration-test-token';
const SECRET_TOKEN = 'integration-test-secret';
const GROUP_CHAT = { id: -100500, type: 'supergroup', title: 'Тестова група' };
const ANALYSIS_MOMENT = at(28);
const MS_IN_SECOND = 1000;

// Telegram stand-in: grammY asks for the bot profile once before handling the first update
const telegramApi = setupServer(
  http.post(`https://api.telegram.org/bot${BOT_TOKEN}/getMe`, () =>
    HttpResponse.json({
      ok: true,
      result: {
        id: 123,
        is_bot: true,
        first_name: 'Coordination bot',
        username: 'coordination_test_bot',
        can_join_groups: true,
        can_read_all_group_messages: true,
        supports_inline_queries: false,
      },
    }),
  ),
);

const participantTelegramIds = new Map<string, number>();

function telegramIdOf(participantId: string) {
  if (!participantTelegramIds.has(participantId)) {
    participantTelegramIds.set(participantId, 1000 + participantTelegramIds.size);
  }
  return participantTelegramIds.get(participantId) as number;
}

let nextUpdateId = 1;

function createMessageUpdate(fixtureMessage: FixtureMessage, messageId: number, chat = GROUP_CHAT) {
  return {
    update_id: nextUpdateId++,
    message: {
      message_id: messageId,
      date: Math.floor(fixtureMessage.sentAt.valueOf() / MS_IN_SECOND),
      chat,
      from: {
        id: telegramIdOf(fixtureMessage.participantId),
        is_bot: false,
        first_name: fixtureMessage.participantId,
      },
      text: fixtureMessage.text,
    },
  };
}

function createBotAddedUpdate() {
  const botUser = { id: 123, is_bot: true, first_name: 'Coordination bot' };
  return {
    update_id: nextUpdateId++,
    my_chat_member: {
      chat: GROUP_CHAT,
      from: { id: 1, is_bot: false, first_name: 'Admin' },
      date: Math.floor(at(0).valueOf() / MS_IN_SECOND),
      old_chat_member: { status: 'left', user: botUser },
      new_chat_member: { status: 'administrator', user: botUser },
    },
  };
}

describe('цикл від вебхука до снапшота', () => {
  let temporaryDirectory: string;
  let database: AppDatabase;
  let POST: (request: Request) => Promise<Response>;

  function sendUpdate(update: object, secretToken = SECRET_TOKEN) {
    return POST(
      new Request('http://localhost/api/telegram/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Telegram-Bot-Api-Secret-Token': secretToken,
        },
        body: JSON.stringify(update),
      }),
    );
  }

  async function sendMessages(fixtureMessages: FixtureMessage[], firstMessageId = 1) {
    for (const [index, fixtureMessage] of fixtureMessages.entries()) {
      await sendUpdate(createMessageUpdate(fixtureMessage, firstMessageId + index));
    }
  }

  function rows<Row>(sql: string) {
    return database.$client.prepare(sql).all() as Row[];
  }

  function countRows(table: string) {
    return rows<{ total: number }>(`SELECT count(*) AS total FROM ${table}`)[0].total;
  }

  beforeAll(() => {
    telegramApi.listen({ onUnhandledFrame: 'error' });
  });

  afterAll(() => {
    telegramApi.close();
  });

  beforeEach(async () => {
    temporaryDirectory = mkdtempSync(join(tmpdir(), 'webhook-cycle-'));
    const databasePath = join(temporaryDirectory, 'coordination.db');
    database = createTestDatabase({ databasePath });

    vi.stubEnv('DATABASE_PATH', databasePath);
    vi.stubEnv('TELEGRAM_BOT_TOKEN', BOT_TOKEN);
    vi.stubEnv('TELEGRAM_WEBHOOK_SECRET', SECRET_TOKEN);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'], now: ANALYSIS_MOMENT });

    // The route keeps its handler and the app keeps its connection between requests, both must start fresh
    Reflect.deleteProperty(globalThis, 'database');
    vi.resetModules();
    ({ POST } = await import('@/app/api/telegram/webhook/route'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    (Reflect.get(globalThis, 'database') as AppDatabase | undefined)?.$client.close();
    Reflect.deleteProperty(globalThis, 'database');
    database.$client.close();
    rmSync(temporaryDirectory, { recursive: true, force: true });
  });

  it('копіпаст-ферма дає снапшот з групою, доказами і знахідкою лише після дебаунсу', async () => {
    await sendUpdate(createBotAddedUpdate());
    await sendMessages(copyPasteFarm.messages);

    expect(countRows('messages')).toBe(copyPasteFarm.messages.length);
    expect(countRows('snapshots')).toBe(0);

    await vi.advanceTimersByTimeAsync(ANALYSIS_DEBOUNCE_MS);

    const groupMembers = rows<{ display_name: string }>(
      `SELECT participants.display_name FROM group_members
       JOIN participants ON participants.id = group_members.participant_id
       ORDER BY participants.display_name`,
    );
    expect(countRows('snapshots')).toBe(1);
    expect(groupMembers.map((member) => member.display_name)).toEqual(['bot1', 'bot2', 'bot3']);
    expect(countRows('pair_signals')).toBeGreaterThan(0);
    expect(countRows('evidence')).toBeGreaterThan(0);
    expect(rows('SELECT group_key, score FROM findings')).toEqual([
      expect.objectContaining({ score: expect.any(Number) }),
    ]);
    expect(countRows('finding_members')).toBe(3);
  });

  it('звичайна розмова дає снапшот без груп і без знахідок', async () => {
    const backgroundChatter = copyPasteFarm.messages.filter(
      (fixtureMessage) => fixtureMessage.participantId === 'alice',
    );
    const replies: FixtureMessage[] = [
      { participantId: 'bob', sentAt: at(14, 30), text: 'Я теж піду, але трохи запізнюсь' },
      {
        participantId: 'carol',
        sentAt: at(20, 0),
        text: 'А квитки ще залишилися на південну трибуну?',
      },
    ];

    await sendUpdate(createBotAddedUpdate());
    await sendMessages([...backgroundChatter, ...replies]);
    await vi.advanceTimersByTimeAsync(ANALYSIS_DEBOUNCE_MS);

    expect(countRows('snapshots')).toBe(1);
    expect(countRows('snapshot_groups')).toBe(0);
    expect(countRows('findings')).toBe(0);
  });

  it('серія повідомлень запускає один аналіз через 5 секунд після останнього', async () => {
    await sendUpdate(createBotAddedUpdate());
    await sendMessages(copyPasteFarm.messages.slice(0, 3));
    await vi.advanceTimersByTimeAsync(ANALYSIS_DEBOUNCE_MS - 1000);

    await sendMessages(copyPasteFarm.messages.slice(3), 4);
    await vi.advanceTimersByTimeAsync(ANALYSIS_DEBOUNCE_MS - 1000);
    expect(countRows('snapshots')).toBe(0);

    await vi.advanceTimersByTimeAsync(1000);
    const [snapshot] = rows<{ computed_at: number }>('SELECT computed_at FROM snapshots');
    expect(countRows('snapshots')).toBe(1);
    expect(snapshot.computed_at).toBe(ANALYSIS_MOMENT.valueOf() + 2 * ANALYSIS_DEBOUNCE_MS - 1000);
  });

  it('новий аналіз замінює снапшот і не дублює знахідку для того самого складу групи', async () => {
    await sendUpdate(createBotAddedUpdate());
    await sendMessages(copyPasteFarm.messages);
    await vi.advanceTimersByTimeAsync(ANALYSIS_DEBOUNCE_MS);
    const [firstSnapshot] = rows<{ id: number }>('SELECT id FROM snapshots');

    await sendUpdate(
      createMessageUpdate(
        { participantId: 'alice', sentAt: at(28), text: 'Хтось бачив, де продають воду?' },
        100,
      ),
    );
    await vi.advanceTimersByTimeAsync(ANALYSIS_DEBOUNCE_MS);

    const snapshotsAfter = rows<{ id: number }>('SELECT id FROM snapshots');
    expect(snapshotsAfter).toHaveLength(1);
    expect(snapshotsAfter[0].id).not.toBe(firstSnapshot.id);
    expect(countRows('findings')).toBe(1);
    expect(rows('SELECT snapshot_group_id FROM findings')).toEqual([
      { snapshot_group_id: expect.any(Number) },
    ]);
  });

  it('повідомлення з групи без бота не зберігаються і не запускають аналіз', async () => {
    await sendMessages(copyPasteFarm.messages.slice(0, 3));
    await vi.advanceTimersByTimeAsync(ANALYSIS_DEBOUNCE_MS);

    expect(countRows('sources')).toBe(0);
    expect(countRows('messages')).toBe(0);
    expect(countRows('snapshots')).toBe(0);
  });

  it('запит з неправильним секретом відхиляється і нічого не змінює в базі', async () => {
    const response = await sendUpdate(createBotAddedUpdate(), 'wrong-secret');

    expect(response.status).toBe(401);
    expect(countRows('sources')).toBe(0);
  });
});

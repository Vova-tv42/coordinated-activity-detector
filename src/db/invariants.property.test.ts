import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  CHAT_END,
  CHAT_START,
  type ChatDelivery,
  chatArbitrary,
  countUniqueMessages,
  type GeneratedChat,
  invalidProfileValuesArbitrary,
  type ProfileValues,
  participantDisplayName,
  participantExternalId,
  twoChatsArbitrary,
  validProfileValuesArbitrary,
} from '@/db/chat-arbitraries';
import type { AppDatabase } from '@/db/connection';
import { registerTelegramSource, saveIncomingMessage } from '@/db/ingest';
import { analyzeSource } from '@/db/snapshots';
import { createTestDatabase } from '@/db/test-database';

const PROPERTY_SEED = 20_260_115;
const PROPERTY_RUNS = 100;
const ONE_MINUTE_MS = 60_000;
const MAX_EXTRA_REDELIVERIES = 20;
const MAX_ANALYSIS_COUNT = 4;
const PROFILE_OUT_OF_RANGE_MESSAGE = 'detection profile values are out of range';
const SIGNAL_KINDS_SQL_LIST = "'text', 'coactivity', 'cosharing'";

const assertionOptions = { seed: PROPERTY_SEED, numRuns: PROPERTY_RUNS };

function withTestDatabase<TResult>(callback: (database: AppDatabase) => TResult) {
  const database = createTestDatabase();
  try {
    return callback(database);
  } finally {
    database.$client.close();
  }
}

function deliverMessage(database: AppDatabase, sourceId: number, delivery: ChatDelivery) {
  saveIncomingMessage(database, {
    sourceId,
    externalId: participantExternalId(delivery.participantIndex),
    displayName: participantDisplayName(delivery.participantIndex),
    tgMessageId: delivery.tgMessageId,
    sentAt: new Date(CHAT_START.getTime() + delivery.offsetMs),
    text: delivery.text,
  });
}

function ingestChat(database: AppDatabase, chatId: number, chat: GeneratedChat) {
  const sourceId = registerTelegramSource(database, { chatId, title: `Чат ${chatId}` });
  for (const delivery of chat.deliveries) {
    deliverMessage(database, sourceId, delivery);
  }
  return sourceId;
}

function selectRows<TRow>(database: AppDatabase, sql: string, ...parameters: unknown[]) {
  return database.$client.prepare(sql).all(...parameters) as TRow[];
}

function countRows(database: AppDatabase, sql: string, ...parameters: unknown[]) {
  const row = database.$client.prepare(sql).get(...parameters) as { total: number };
  return row.total;
}

function selectSourceIds(database: AppDatabase) {
  return selectRows<{ id: number }>(database, 'SELECT id FROM sources ORDER BY id').map(
    (source) => source.id,
  );
}

function insertProfile(database: AppDatabase, name: string, values: ProfileValues) {
  return database.$client
    .prepare(
      `INSERT INTO detection_profiles (name, sync_gap_sec, window_minutes, window_max_messages,
        min_text_length, sim_threshold, w_text, w_coactivity, w_cosharing, edge_threshold,
        keep_threshold)
       VALUES (@name, @syncGapSec, @windowMinutes, @windowMaxMessages, @minTextLength,
        @simThreshold, @wText, @wCoactivity, @wCosharing, @edgeThreshold, @keepThreshold)`,
    )
    .run({ name, ...values });
}

function updateProfile(database: AppDatabase, profileId: number, values: ProfileValues) {
  return database.$client
    .prepare(
      `UPDATE detection_profiles SET sync_gap_sec = @syncGapSec, window_minutes = @windowMinutes,
        window_max_messages = @windowMaxMessages, min_text_length = @minTextLength,
        sim_threshold = @simThreshold, w_text = @wText, w_coactivity = @wCoactivity,
        w_cosharing = @wCosharing, edge_threshold = @edgeThreshold,
        keep_threshold = @keepThreshold
       WHERE id = @profileId`,
    )
    .run({ profileId, ...values });
}

describe('властивості інваріантів бази даних на згенерованих чатах', () => {
  it('лічильник повідомлень учасника дорівнює кількості його рядків, навіть із повторною доставкою', () => {
    fc.assert(
      fc.property(chatArbitrary, (chat) =>
        withTestDatabase((database) => {
          ingestChat(database, 1, chat);

          const mismatchedParticipants = countRows(
            database,
            `SELECT COUNT(*) AS total FROM participants
             WHERE message_count <> (SELECT COUNT(*) FROM messages WHERE participant_id = participants.id)`,
          );
          const storedMessages = countRows(database, 'SELECT COUNT(*) AS total FROM messages');

          expect(mismatchedParticipants).toBe(0);
          expect(storedMessages).toBe(countUniqueMessages(chat));
        }),
      ),
      assertionOptions,
    );
  });

  it('повторна доставка довільної підмножини повідомлень не змінює вміст таблиць', () => {
    const chatWithRedeliveredPositions = fc.tuple(
      chatArbitrary,
      fc.array(fc.nat(), { maxLength: MAX_EXTRA_REDELIVERIES }),
    );

    fc.assert(
      fc.property(chatWithRedeliveredPositions, ([chat, redeliveredPositions]) =>
        withTestDatabase((database) => {
          const sourceId = ingestChat(database, 1, chat);
          const selectStoredRows = () => ({
            messages: selectRows(database, 'SELECT * FROM messages ORDER BY id'),
            participants: selectRows(database, 'SELECT * FROM participants ORDER BY id'),
          });
          const rowsBeforeRedelivery = selectStoredRows();

          for (const position of redeliveredPositions) {
            deliverMessage(database, sourceId, chat.deliveries[position % chat.deliveries.length]);
          }

          expect(selectStoredRows()).toEqual(rowsBeforeRedelivery);
        }),
      ),
      assertionOptions,
    );
  });

  it('після кількох аналізів у джерела рівно один снапшот', () => {
    const chatWithAnalysisCount = fc.tuple(
      chatArbitrary,
      fc.integer({ min: 1, max: MAX_ANALYSIS_COUNT }),
    );

    fc.assert(
      fc.property(chatWithAnalysisCount, ([chat, analysisCount]) =>
        withTestDatabase((database) => {
          const sourceId = ingestChat(database, 1, chat);

          for (let analysisNumber = 0; analysisNumber < analysisCount; analysisNumber++) {
            const windowEnd = new Date(CHAT_END.getTime() + analysisNumber * ONE_MINUTE_MS);
            analyzeSource(database, sourceId, windowEnd);
          }

          const snapshotCount = countRows(
            database,
            'SELECT COUNT(*) AS total FROM snapshots WHERE source_id = ?',
            sourceId,
          );
          expect(snapshotCount).toBe(1);
        }),
      ),
      assertionOptions,
    );
  });

  it('member_count групи збігається з group_members, а всі члени належать джерелу снапшота', () => {
    fc.assert(
      fc.property(twoChatsArbitrary, ([firstChat, secondChat]) =>
        withTestDatabase((database) => {
          ingestChat(database, 1, firstChat);
          ingestChat(database, 2, secondChat);
          for (const sourceId of selectSourceIds(database)) {
            analyzeSource(database, sourceId, CHAT_END);
          }

          const groupsWithWrongMemberCount = countRows(
            database,
            `SELECT COUNT(*) AS total FROM snapshot_groups
             WHERE member_count <> (
               SELECT COUNT(*) FROM group_members WHERE snapshot_group_id = snapshot_groups.id)`,
          );
          const membersFromOtherSource = countRows(
            database,
            `SELECT COUNT(*) AS total FROM group_members
             JOIN snapshot_groups ON snapshot_groups.id = group_members.snapshot_group_id
             JOIN snapshots ON snapshots.id = snapshot_groups.snapshot_id
             JOIN participants ON participants.id = group_members.participant_id
             WHERE participants.source_id <> snapshots.source_id`,
          );

          expect(groupsWithWrongMemberCount).toBe(0);
          expect(membersFromOtherSource).toBe(0);
        }),
      ),
      assertionOptions,
    );
  });

  it('значення сигналів пар лежать у [0, 1], а вид сигналу допустимий', () => {
    fc.assert(
      fc.property(chatArbitrary, (chat) =>
        withTestDatabase((database) => {
          const sourceId = ingestChat(database, 1, chat);
          analyzeSource(database, sourceId, CHAT_END);

          const signalsOutOfRange = countRows(
            database,
            'SELECT COUNT(*) AS total FROM pair_signals WHERE value NOT BETWEEN 0 AND 1',
          );
          const signalsOfUnknownKind = countRows(
            database,
            `SELECT COUNT(*) AS total FROM pair_signals
             WHERE signal_kind NOT IN (${SIGNAL_KINDS_SQL_LIST})`,
          );

          expect(signalsOutOfRange).toBe(0);
          expect(signalsOfUnknownKind).toBe(0);
        }),
      ),
      assertionOptions,
    );
  });

  it('обидва повідомлення в evidence належать джерелу снапшота', () => {
    fc.assert(
      fc.property(twoChatsArbitrary, ([firstChat, secondChat]) =>
        withTestDatabase((database) => {
          ingestChat(database, 1, firstChat);
          ingestChat(database, 2, secondChat);
          for (const sourceId of selectSourceIds(database)) {
            analyzeSource(database, sourceId, CHAT_END);
          }

          const evidenceFromOtherSource = countRows(
            database,
            `SELECT COUNT(*) AS total FROM evidence
             JOIN pair_signals ON pair_signals.id = evidence.pair_signal_id
             JOIN snapshots ON snapshots.id = pair_signals.snapshot_id
             JOIN messages AS message_a ON message_a.id = evidence.message_a_id
             JOIN messages AS message_b ON message_b.id = evidence.message_b_id
             WHERE message_a.source_id <> snapshots.source_id
                OR message_b.source_id <> snapshots.source_id`,
          );

          expect(evidenceFromOtherSource).toBe(0);
        }),
      ),
      assertionOptions,
    );
  });

  it('після всіх операцій немає порушень зовнішніх ключів, а integrity_check повертає ok', () => {
    fc.assert(
      fc.property(twoChatsArbitrary, ([firstChat, secondChat]) =>
        withTestDatabase((database) => {
          ingestChat(database, 1, firstChat);
          ingestChat(database, 2, secondChat);
          for (const sourceId of selectSourceIds(database)) {
            analyzeSource(database, sourceId, CHAT_END);
            analyzeSource(database, sourceId, new Date(CHAT_END.getTime() + ONE_MINUTE_MS));
          }

          expect(database.$client.pragma('foreign_key_check')).toEqual([]);
          expect(database.$client.pragma('integrity_check', { simple: true })).toBe('ok');
        }),
      ),
      assertionOptions,
    );
  });

  describe('тригер перевірки профілю', () => {
    it('приймає будь-які значення в межах допустимої форми', () => {
      fc.assert(
        fc.property(validProfileValuesArbitrary, (values) =>
          withTestDatabase((database) => {
            insertProfile(database, 'Згенерований', values);

            const storedProfiles = countRows(
              database,
              'SELECT COUNT(*) AS total FROM detection_profiles WHERE name = ?',
              'Згенерований',
            );
            expect(storedProfiles).toBe(1);
          }),
        ),
        assertionOptions,
      );
    });

    it('відхиляє вставку з будь-яким значенням поза межами', () => {
      fc.assert(
        fc.property(invalidProfileValuesArbitrary, (values) =>
          withTestDatabase((database) => {
            expect(() => insertProfile(database, 'Некоректний', values)).toThrow(
              PROFILE_OUT_OF_RANGE_MESSAGE,
            );
          }),
        ),
        assertionOptions,
      );
    });

    it('відхиляє оновлення профілю значеннями поза межами', () => {
      fc.assert(
        fc.property(validProfileValuesArbitrary, invalidProfileValuesArbitrary, (valid, invalid) =>
          withTestDatabase((database) => {
            const { lastInsertRowid } = insertProfile(database, 'Для оновлення', valid);

            expect(() => updateProfile(database, Number(lastInsertRowid), invalid)).toThrow(
              PROFILE_OUT_OF_RANGE_MESSAGE,
            );
          }),
        ),
        assertionOptions,
      );
    });
  });

  it('генератор створює чати, на яких виявляються групи, сигнали та докази', () => {
    const sampledChats = fc.sample(chatArbitrary, { seed: PROPERTY_SEED, numRuns: PROPERTY_RUNS });
    const totals = { groups: 0, signals: 0, evidence: 0 };

    for (const chat of sampledChats) {
      withTestDatabase((database) => {
        const sourceId = ingestChat(database, 1, chat);
        analyzeSource(database, sourceId, CHAT_END);
        totals.groups += countRows(database, 'SELECT COUNT(*) AS total FROM snapshot_groups');
        totals.signals += countRows(database, 'SELECT COUNT(*) AS total FROM pair_signals');
        totals.evidence += countRows(database, 'SELECT COUNT(*) AS total FROM evidence');
      });
    }

    expect(totals.groups).toBeGreaterThan(0);
    expect(totals.signals).toBeGreaterThan(0);
    expect(totals.evidence).toBeGreaterThan(0);
  });
});

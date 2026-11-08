import { eq } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type AppDatabase, openDatabase } from '@/db/connection';
import { saveIncomingMessage } from '@/db/ingest';
import {
  detectionProfiles,
  evidence,
  findingMembers,
  findings,
  groupMembers,
  pairSignals,
  participants,
  snapshotGroups,
  snapshots,
  sources,
} from '@/db/schema';
import {
  analyzeSource,
  findLatestSnapshot,
  listSnapshotGroups,
  listSnapshotPairs,
} from '@/db/snapshots';
import {
  analyzeCoordinationFromMessages,
  type CoordinationAnalysisResult,
  type ScoredPair,
} from '@/detection/detectors';
import {
  at,
  copyPasteFarm,
  DEFAULT_PROFILE,
  type FixtureMessage,
  quietChat,
} from '@/detection/test-fixtures';

// Spy: the real detector runs by default, single tests replace its result with a stub
vi.mock('@/detection/detectors', async (importOriginal) => {
  const originalDetectors = await importOriginal<typeof import('@/detection/detectors')>();
  return {
    ...originalDetectors,
    analyzeCoordinationFromMessages: vi.fn(originalDetectors.analyzeCoordinationFromMessages),
  };
});

const WINDOW_END = at(30);

function createScoredPair(participantAId: number, participantBId: number): ScoredPair {
  return {
    participantAId,
    participantBId,
    score: 0.6,
    signals: {
      text: { signalKind: 'text', value: 0, evidence: [] },
      coactivity: {
        signalKind: 'coactivity',
        value: 0.9,
        gridZeroJaccard: 0.9,
        gridShiftedJaccard: 0.8,
      },
      cosharing: {
        signalKind: 'cosharing',
        value: 0.5,
        sharedItemsA: ['t.me/news'],
        sharedItemsB: ['t.me/news'],
        intersection: ['t.me/news'],
      },
    },
  };
}

function createAnalysisWithPair(pair: ScoredPair): CoordinationAnalysisResult {
  return {
    retainedPairs: [pair],
    edges: [pair],
    groups: [
      {
        groupKey: `${pair.participantAId}|${pair.participantBId}`,
        participantIds: [pair.participantAId, pair.participantBId],
        score: pair.score,
        edges: [pair],
      },
    ],
  };
}

describe('analyzeSource', () => {
  let database: AppDatabase;
  let sourceId: number;

  function saveMessages(chatMessages: FixtureMessage[]) {
    for (const message of chatMessages) {
      saveIncomingMessage(database, {
        sourceId,
        externalId: message.participantId,
        displayName: message.participantId,
        sentAt: new Date(message.sentAt),
        text: message.text,
      });
    }
  }

  function participantIdsOf(...externalIds: string[]) {
    return externalIds.map(
      (externalId) =>
        database
          .select({ id: participants.id })
          .from(participants)
          .where(eq(participants.externalId, externalId))
          .get()?.id,
    );
  }

  function membersOfFinding(findingId: number) {
    return database
      .select({ participantId: findingMembers.participantId })
      .from(findingMembers)
      .where(eq(findingMembers.findingId, findingId))
      .all()
      .map((member) => member.participantId);
  }

  beforeEach(() => {
    database = openDatabase(':memory:');
    migrate(database, { migrationsFolder: './drizzle' });
    sourceId = database
      .insert(sources)
      .values({ kind: 'telegram', title: 'Тестова група', profileId: 1 })
      .returning()
      .get().id;
  });

  afterEach(() => {
    database.$client.close();
    vi.clearAllMocks();
  });

  it('зберігає снапшот із групою, сигналами пар і доказами', () => {
    saveMessages(copyPasteFarm.messages);

    analyzeSource(database, sourceId, WINDOW_END);

    expect(database.select().from(snapshots).all()).toEqual([
      expect.objectContaining({ sourceId, computedAt: WINDOW_END, windowStart: at(0) }),
    ]);
    expect(database.select().from(snapshotGroups).all()).toEqual([
      expect.objectContaining({ memberCount: 3 }),
    ]);
    expect(
      database
        .select()
        .from(groupMembers)
        .all()
        .map((member) => member.participantId),
    ).toEqual(participantIdsOf('bot1', 'bot2', 'bot3'));
    expect(database.select().from(pairSignals).all().length).toBeGreaterThanOrEqual(9);
    expect(database.select().from(evidence).all().length).toBeGreaterThan(0);
  });

  it('записує знахідку з учасниками, коли група зʼявляється вперше', () => {
    saveMessages(copyPasteFarm.messages);

    analyzeSource(database, sourceId, WINDOW_END);

    const [finding] = database.select().from(findings).all();
    expect(finding).toMatchObject({ sourceId, detectedAt: WINDOW_END });
    expect(finding.snapshotGroupId).toBe(database.select().from(snapshotGroups).get()?.id);
    expect(membersOfFinding(finding.id)).toEqual(participantIdsOf('bot1', 'bot2', 'bot3'));
  });

  it('тримає лише останній снапшот і не дублює знахідку для незмінної групи', () => {
    saveMessages(copyPasteFarm.messages);

    analyzeSource(database, sourceId, WINDOW_END);
    analyzeSource(database, sourceId, at(30, 5));

    const latestGroup = database.select().from(snapshotGroups).get();
    expect(database.select().from(snapshots).all()).toHaveLength(1);
    expect(database.select().from(findings).all()).toEqual([
      expect.objectContaining({ detectedAt: WINDOW_END, snapshotGroupId: latestGroup?.id }),
    ]);
  });

  it('записує нову знахідку, коли змінюється склад групи', () => {
    saveMessages(copyPasteFarm.messages);
    analyzeSource(database, sourceId, WINDOW_END);

    const copiedPosts = copyPasteFarm.messages.filter(
      (message) => message.participantId === 'bot1',
    );
    saveMessages(
      copiedPosts.map((message) => ({
        ...message,
        participantId: 'bot4',
        sentAt: new Date(new Date(message.sentAt).getTime() + 1000),
      })),
    );
    analyzeSource(database, sourceId, at(30, 5));

    const [oldFinding, newFinding] = database.select().from(findings).all();
    expect(oldFinding.snapshotGroupId).toBeNull();
    expect(newFinding.snapshotGroupId).not.toBeNull();
    expect(membersOfFinding(newFinding.id)).toEqual(
      participantIdsOf('bot1', 'bot2', 'bot3', 'bot4'),
    );
  });

  it('не бере повідомлення, старші за тривалість вікна', () => {
    saveMessages(copyPasteFarm.messages);

    // The default window is 30 minutes and the last farm message is before minute 30
    analyzeSource(database, sourceId, at(60));

    expect(database.select().from(snapshots).all()).toHaveLength(1);
    expect(database.select().from(snapshotGroups).all()).toEqual([]);
    expect(database.select().from(findings).all()).toEqual([]);
  });

  it('звужує вікно до ліміту повідомлень, якщо їх більше', () => {
    saveMessages(copyPasteFarm.messages);
    database.update(detectionProfiles).set({ windowMaxMessages: 3 }).run();

    analyzeSource(database, sourceId, WINDOW_END);

    const newestMessageTimes = copyPasteFarm.messages
      .map((message) => new Date(message.sentAt).getTime())
      .sort((timeA, timeB) => timeB - timeA);
    expect(database.select().from(snapshots).get()?.windowStart).toEqual(
      new Date(newestMessageTimes[2]),
    );
  });

  it('зберігає порожній снапшот для спокійного чату', () => {
    saveMessages(quietChat.messages);

    analyzeSource(database, sourceId, WINDOW_END);

    expect(database.select().from(snapshots).all()).toHaveLength(1);
    expect(database.select().from(findings).all()).toEqual([]);
  });

  it('кидає помилку для неіснуючого джерела', () => {
    expect(() => analyzeSource(database, 999, WINDOW_END)).toThrow(/999/);
  });

  describe('з тестовими двійниками детектора', () => {
    it('передає детектору лише повідомлення з вікна і профіль джерела', () => {
      saveMessages(copyPasteFarm.messages);
      database.update(detectionProfiles).set({ windowMaxMessages: 4 }).run();

      analyzeSource(database, sourceId, WINDOW_END);

      expect(analyzeCoordinationFromMessages).toHaveBeenCalledExactlyOnceWith(
        expect.any(Array),
        expect.objectContaining({ windowMinutes: 30, windowMaxMessages: 4 }),
      );
      const [windowMessages] = vi.mocked(analyzeCoordinationFromMessages).mock.calls[0];
      expect(windowMessages).toHaveLength(4);
      expect(windowMessages.every((message) => message.sentAt <= WINDOW_END)).toBe(true);
    });

    it('не зберігає докази для ребра групи без текстового збігу', () => {
      saveMessages(quietChat.messages.slice(0, 2));
      const [firstId, secondId] = database
        .select({ id: participants.id })
        .from(participants)
        .all()
        .map((participant) => participant.id);
      // Stub: a group found only by co-activity and co-sharing, without similar texts
      vi.mocked(analyzeCoordinationFromMessages).mockReturnValueOnce(
        createAnalysisWithPair(createScoredPair(firstId, secondId)),
      );

      analyzeSource(database, sourceId, WINDOW_END);

      expect(database.select().from(snapshotGroups).all()).toHaveLength(1);
      expect(
        database
          .select()
          .from(pairSignals)
          .all()
          .map((signal) => [signal.signalKind, signal.value]),
      ).toEqual([
        ['text', 0],
        ['coactivity', 0.9],
        ['cosharing', 0.5],
      ]);
      expect(database.select().from(evidence).all()).toEqual([]);
      expect(database.select().from(findings).get()?.groupKey).toBe(`${firstId}|${secondId}`);
    });

    it('лишає попередній снапшот, якщо збереження нового завершилось помилкою', () => {
      saveMessages(copyPasteFarm.messages);
      analyzeSource(database, sourceId, WINDOW_END);
      const previousSnapshot = findLatestSnapshot(database, sourceId);
      const unknownParticipantId = 999;
      // Stub: a pair with a participant that is not in the database breaks the foreign key
      vi.mocked(analyzeCoordinationFromMessages).mockReturnValueOnce(
        createAnalysisWithPair(createScoredPair(1, unknownParticipantId)),
      );

      expect(() => analyzeSource(database, sourceId, at(30, 5))).toThrow(/FOREIGN KEY/);

      expect(findLatestSnapshot(database, sourceId)).toEqual(previousSnapshot);
      expect(database.select().from(findings).all()).toHaveLength(1);
    });
  });

  describe('читання останнього снапшота', () => {
    function analyzeFarm() {
      saveMessages(copyPasteFarm.messages);
      analyzeSource(database, sourceId, WINDOW_END);
      const snapshot = findLatestSnapshot(database, sourceId);
      if (!snapshot) {
        throw new Error('Snapshot was not saved');
      }
      return snapshot;
    }

    it('повертає undefined, поки аналіз ще не запускався', () => {
      expect(findLatestSnapshot(database, sourceId)).toBeUndefined();
    });

    it('повертає групи з іменами учасників', () => {
      const snapshot = analyzeFarm();

      expect(listSnapshotGroups(database, snapshot.id)).toEqual([
        {
          id: expect.any(Number),
          score: expect.any(Number),
          memberNames: ['bot1', 'bot2', 'bot3'],
        },
      ]);
    });

    it('повертає пари з сигналами, відсортовані за скором', () => {
      const snapshot = analyzeFarm();

      const pairs = listSnapshotPairs(database, snapshot.id, DEFAULT_PROFILE);

      const scores = pairs.map((pair) => pair.score);
      expect(scores).toEqual([...scores].sort((scoreA, scoreB) => scoreB - scoreA));
      expect(
        pairs.slice(0, 3).map((pair) => [pair.participantAName, pair.participantBName]),
      ).toEqual(
        expect.arrayContaining([
          ['bot1', 'bot2'],
          ['bot1', 'bot3'],
          ['bot2', 'bot3'],
        ]),
      );
    });

    it('рахує скор пари за вагами профілю', () => {
      const snapshot = analyzeFarm();

      const [topPair] = listSnapshotPairs(database, snapshot.id, {
        wText: 1,
        wCoactivity: 0,
        wCosharing: 0,
      });

      expect(topPair.score).toBe(topPair.signals.text);
    });
  });
});

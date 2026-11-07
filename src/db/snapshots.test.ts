import { eq } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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
import { analyzeSource } from '@/db/snapshots';
import { at, copyPasteFarm, type FixtureMessage, quietChat } from '@/detection/test-fixtures';

const WINDOW_END = at(30);

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
});

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AppDatabase } from '@/db/connection';
import { saveIncomingMessage } from '@/db/ingest';
import { findings, snapshots, sources, windowMetrics } from '@/db/schema';
import { createTestDatabase } from '@/db/test-database';
import { analyzeSourceTimeline, listTimelineWindowEnds, listWindowMetrics } from '@/db/timeline';
import { at } from '@/detection/test-fixtures';

const WINDOW_MINUTES = 30;
const MS_IN_MINUTE = 60_000;

const FARM_POST = 'Голосуйте за Петренка, він єдиний, хто справді дбає про наше місто!';
const QUIET_CHAT = [
  'Доброго ранку всім, хто сьогодні на зборах?',
  'Я буду трохи пізніше, почніть без мене',
  'Хтось знає, коли відкриється новий спортзал?',
  'Дякую всім, наступні збори через тиждень',
];

function minutesBetween(start: Date, end: Date) {
  return (end.getTime() - start.getTime()) / MS_IN_MINUTE;
}

describe('listTimelineWindowEnds', () => {
  it('крокує на третину вікна і закінчується на останньому повідомленні', () => {
    const windowEnds = listTimelineWindowEnds(at(0), at(90), WINDOW_MINUTES);

    expect(windowEnds.map((windowEnd) => minutesBetween(at(0), windowEnd))).toEqual([
      10, 20, 30, 40, 50, 60, 70, 80, 90,
    ]);
  });

  it('додає ще одне вікно, якщо останнє повідомлення між кроками', () => {
    const windowEnds = listTimelineWindowEnds(at(0), at(95), WINDOW_MINUTES);

    expect(minutesBetween(at(0), windowEnds.at(-1) as Date)).toBe(100);
  });

  it('для одного повідомлення будує одне вікно', () => {
    expect(listTimelineWindowEnds(at(5), at(5), WINDOW_MINUTES)).toEqual([at(15)]);
  });

  it('кожне повідомлення потрапляє щонайменше в одне вікно', () => {
    const messageTimes = [at(0), at(3, 30), at(41), at(77, 59), at(78)];
    const windowEnds = listTimelineWindowEnds(messageTimes[0], at(78), WINDOW_MINUTES);

    const everyMessageCovered = messageTimes.every((messageTime) =>
      windowEnds.some((windowEnd) => {
        const minutesBeforeEnd = minutesBetween(messageTime, windowEnd);
        return minutesBeforeEnd >= 0 && minutesBeforeEnd < WINDOW_MINUTES;
      }),
    );
    expect(everyMessageCovered).toBe(true);
  });
});

describe('analyzeSourceTimeline', () => {
  let database: AppDatabase;
  let sourceId: number;

  function saveMessage(author: string, sentAt: Date, text: string) {
    saveIncomingMessage(database, {
      sourceId,
      externalId: author,
      displayName: author,
      sentAt,
      text,
    });
  }

  function saveQuietChatWithFarmInTheMiddle() {
    QUIET_CHAT.forEach((text, index) => {
      saveMessage(`member${index}`, at(index * 40), text);
    });
    saveMessage('bot1', at(61, 0), FARM_POST);
    saveMessage('bot2', at(61, 20), FARM_POST);
    saveMessage('bot3', at(61, 45), FARM_POST);
  }

  beforeEach(() => {
    database = createTestDatabase();
    sourceId = database
      .insert(sources)
      .values({ kind: 'upload', title: 'Лог для таймлайну', profileId: 1 })
      .returning()
      .get().id;
  });

  afterEach(() => {
    database.$client.close();
  });

  it('пише метрику для кожного вікна від першого до останнього повідомлення', () => {
    saveQuietChatWithFarmInTheMiddle();

    analyzeSourceTimeline(database, sourceId);

    const timeline = listWindowMetrics(database, sourceId);
    expect(timeline.map((window) => minutesBetween(at(0), window.windowEnd))).toEqual([
      10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120,
    ]);
    expect(
      timeline.every(
        (window) => minutesBetween(window.windowStart, window.windowEnd) === WINDOW_MINUTES,
      ),
    ).toBe(true);
  });

  it('показує координацію лише у вікнах, що містять ферму', () => {
    saveQuietChatWithFarmInTheMiddle();

    analyzeSourceTimeline(database, sourceId);

    const windowsWithGroups = listWindowMetrics(database, sourceId)
      .filter((window) => window.groupCount > 0)
      .map((window) => ({
        endMinute: minutesBetween(at(0), window.windowEnd),
        groupCount: window.groupCount,
        flaggedParticipants: window.flaggedParticipants,
      }));
    expect(windowsWithGroups).toEqual([
      { endMinute: 70, groupCount: 1, flaggedParticipants: 3 },
      { endMinute: 80, groupCount: 1, flaggedParticipants: 3 },
      { endMinute: 90, groupCount: 1, flaggedParticipants: 3 },
    ]);
  });

  it('рівень координації високий у вікнах з фермою і нульовий у тихих вікнах', () => {
    saveQuietChatWithFarmInTheMiddle();

    analyzeSourceTimeline(database, sourceId);

    const timeline = listWindowMetrics(database, sourceId);
    const farmWindows = timeline.filter((window) => window.groupCount > 0);
    const quietWindows = timeline.filter((window) => window.groupCount === 0);
    expect(farmWindows.every((window) => window.maxScore >= 0.5)).toBe(true);
    expect(quietWindows.every((window) => window.maxScore < 0.5)).toBe(true);
    expect(timeline[0].maxScore).toBe(0);
  });

  it('лишає снапшот останнього вікна і одну знахідку з моменту, коли ферму вперше видно', () => {
    saveQuietChatWithFarmInTheMiddle();

    analyzeSourceTimeline(database, sourceId);

    const savedSnapshots = database.select().from(snapshots).all();
    const savedFindings = database.select().from(findings).all();
    expect(savedSnapshots).toHaveLength(1);
    expect(minutesBetween(at(0), savedSnapshots[0].windowEnd)).toBe(120);
    expect(savedFindings).toHaveLength(1);
    expect(minutesBetween(at(0), savedFindings[0].detectedAt)).toBe(70);
  });

  it('повторний прогін замінює таймлайн, а не дописує до нього', () => {
    saveQuietChatWithFarmInTheMiddle();

    analyzeSourceTimeline(database, sourceId);
    analyzeSourceTimeline(database, sourceId);

    expect(database.select().from(windowMetrics).all()).toHaveLength(12);
  });

  it('для джерела без повідомлень нічого не пише і не падає', () => {
    analyzeSourceTimeline(database, sourceId);

    expect(listWindowMetrics(database, sourceId)).toEqual([]);
    expect(database.select().from(snapshots).all()).toEqual([]);
  });

  it('падає для неіснуючого джерела', () => {
    expect(() => analyzeSourceTimeline(database, 999)).toThrow('Source 999 does not exist');
  });
});

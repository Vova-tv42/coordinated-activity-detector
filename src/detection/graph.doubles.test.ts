import { beforeEach, describe, expect, it, vi } from 'vitest';
import { detectPairSignals } from './detectors';
import { analyzeCoordination, analyzeCoordinationFromMessages } from './graph';
import type {
  DetectionProfileConfig,
  DetectorMessage,
  GraphThresholdProfile,
  PairSignalsResult,
  ParticipantMessages,
} from './types';

// Реальні детектори замінюються двійником: граф тестується ізольовано від обчислення сигналів
vi.mock('./detectors', () => ({ detectPairSignals: vi.fn() }));

describe('analyzeCoordination з тестовими двійниками', () => {
  const profile: DetectionProfileConfig & GraphThresholdProfile = {
    syncGapSec: 60,
    minTextLength: 12,
    simThreshold: 0.6,
    wText: 0.5,
    wCoactivity: 0.3,
    wCosharing: 0.2,
    edgeThreshold: 0.5,
    keepThreshold: 0.2,
  };

  const BASE_TIME = 1_700_000_000_000;

  // Ваги в сумі дають 1, тому підсумковий скор пари дорівнює значенню сигналів
  function makeSignals(value: number): PairSignalsResult {
    return {
      text: { signalKind: 'text', value, evidence: [] },
      coactivity: {
        signalKind: 'coactivity',
        value,
        gridZeroJaccard: value,
        gridShiftedJaccard: value,
      },
      cosharing: {
        signalKind: 'cosharing',
        value,
        sharedItemsA: [],
        sharedItemsB: [],
        intersection: [],
      },
    };
  }

  function participant(id: number, count = 1): ParticipantMessages {
    const messages: DetectorMessage[] = Array.from({ length: count }, (_, index) => ({
      id: id * 100 + index,
      participantId: id,
      sentAt: BASE_TIME + index,
      text: `Повідомлення учасника ${id} номер ${index}`,
    }));
    return { participantId: id, messages };
  }

  const detectPairSignalsMock = vi.mocked(detectPairSignals);

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('[stub] будує групу з пари, для якої двійник повертає високі сигнали', () => {
    detectPairSignalsMock.mockReturnValue(makeSignals(0.9));

    const result = analyzeCoordination([participant(1), participant(2)], profile);

    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].groupKey).toBe('1:2');
    expect(result.groups[0].score).toBeCloseTo(0.9);
    expect(result.edges).toHaveLength(1);
  });

  it('[spy] порівнює кожну пару учасників рівно один раз', () => {
    detectPairSignalsMock.mockReturnValue(makeSignals(0));

    analyzeCoordination([participant(1), participant(2), participant(3), participant(4)], profile);

    // C(4, 2) = 6 пар
    expect(detectPairSignalsMock).toHaveBeenCalledTimes(6);
  });

  it('[spy] не порівнює учасників без повідомлень', () => {
    detectPairSignalsMock.mockReturnValue(makeSignals(0));

    analyzeCoordination(
      [participant(1), participant(2), participant(3, 0), participant(4)],
      profile,
    );

    // Лишилось 3 учасники → 3 пари
    expect(detectPairSignalsMock).toHaveBeenCalledTimes(3);
  });

  it('[spy] не викликає детектори, якщо учасників з повідомленнями менше двох', () => {
    const result = analyzeCoordination([participant(1), participant(2, 0)], profile);

    expect(detectPairSignalsMock).not.toHaveBeenCalled();
    expect(result).toEqual({ groups: [], edges: [], retainedPairs: [] });
  });

  it('[spy] передає повідомлення в канонічному порядку ідентифікаторів', () => {
    detectPairSignalsMock.mockReturnValue(makeSignals(0.9));
    const participantTen = participant(10);
    const participantTwo = participant(2);

    const result = analyzeCoordination([participantTen, participantTwo], profile);

    expect(detectPairSignalsMock).toHaveBeenCalledWith(
      participantTwo.messages,
      participantTen.messages,
      profile,
    );
    expect(result.edges[0].participantAId).toBe(2);
    expect(result.edges[0].participantBId).toBe(10);
  });

  it('[stub] пара зі скором між keepThreshold та edgeThreshold зберігається, але не стає ребром', () => {
    detectPairSignalsMock.mockReturnValue(makeSignals(0.4));

    const result = analyzeCoordination([participant(1), participant(2)], profile);

    expect(result.edges).toHaveLength(0);
    expect(result.groups).toHaveLength(0);
    expect(result.retainedPairs).toHaveLength(1);
  });

  it('[fake] працює з двійником, що видає скори з таблиці', () => {
    // Fake: спрощена робоча реалізація детектора, яка бере скор з таблиці за парою ідентифікаторів
    const scoreTable: Record<string, number> = {
      '1:2': 0.9,
      '3:4': 0.7,
      '2:3': 0.1,
    };
    detectPairSignalsMock.mockImplementation((messagesA, messagesB) => {
      const key = `${messagesA[0].participantId}:${messagesB[0].participantId}`;
      return makeSignals(scoreTable[key] ?? 0);
    });

    const result = analyzeCoordination(
      [participant(1), participant(2), participant(3), participant(4)],
      profile,
    );

    expect(result.groups.map((group) => group.groupKey)).toEqual(['1:2', '3:4']);
    expect(result.groups[0].score).toBeCloseTo(0.9);
    expect(result.groups[1].score).toBeCloseTo(0.7);
    // keepThreshold = 0.2 відсікає пару 2:3 зі скором 0.1 та пари з нульовим скором
    expect(result.retainedPairs).toHaveLength(2);
  });

  it('[spy] analyzeCoordinationFromMessages групує повідомлення за учасниками й ігнорує анонімні', () => {
    detectPairSignalsMock.mockReturnValue(makeSignals(0.9));
    const messages: DetectorMessage[] = [
      { id: 1, participantId: 1, sentAt: BASE_TIME, text: 'Перше повідомлення першого' },
      { id: 2, participantId: 1, sentAt: BASE_TIME + 1, text: 'Друге повідомлення першого' },
      { id: 3, participantId: 2, sentAt: BASE_TIME + 2, text: 'Єдине повідомлення другого' },
      { id: 4, sentAt: BASE_TIME + 3, text: 'Повідомлення без автора' },
    ];

    const result = analyzeCoordinationFromMessages(messages, profile);

    expect(detectPairSignalsMock).toHaveBeenCalledTimes(1);
    const [messagesA, messagesB] = detectPairSignalsMock.mock.calls[0];
    expect(messagesA).toHaveLength(2);
    expect(messagesB).toHaveLength(1);
    expect(result.groups[0].participantIds).toEqual([1, 2]);
  });
});

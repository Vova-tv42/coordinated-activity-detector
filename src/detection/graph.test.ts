import { describe, expect, it } from 'vitest';
import {
  analyzeCoordination,
  analyzeCoordinationFromMessages,
  calculatePairScore,
  compareParticipantIds,
  createGroupKey,
  extractCoordinatedGroups,
  orderParticipantPair,
} from './graph';
import type {
  DetectionProfileConfig,
  DetectorMessage,
  GraphThresholdProfile,
  PairSignalsResult,
  ParticipantMessages,
  ScoredPair,
} from './types';

describe('graph and aggregation', () => {
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

  function createMockSignals(
    textValue: number,
    coactivityValue: number,
    cosharingValue: number,
  ): PairSignalsResult {
    return {
      text: { signalKind: 'text', value: textValue, evidence: [] },
      coactivity: {
        signalKind: 'coactivity',
        value: coactivityValue,
        gridZeroJaccard: coactivityValue,
        gridShiftedJaccard: coactivityValue,
      },
      cosharing: {
        signalKind: 'cosharing',
        value: cosharingValue,
        sharedItemsA: [],
        sharedItemsB: [],
        intersection: [],
      },
    };
  }

  describe('compareParticipantIds and orderParticipantPair', () => {
    it('порівнює ідентифікатори з урахуванням числових значень', () => {
      expect(compareParticipantIds(2, 10)).toBeLessThan(0);
      expect(compareParticipantIds(10, 2)).toBeGreaterThan(0);
      expect(compareParticipantIds(5, 5)).toBe(0);
      expect(compareParticipantIds('alice', 'bob')).toBeLessThan(0);
    });

    it('впорядковує пару ідентифікаторів у канонічному порядку', () => {
      expect(orderParticipantPair(10, 2)).toEqual([2, 10]);
      expect(orderParticipantPair(2, 10)).toEqual([2, 10]);
      expect(orderParticipantPair('bob', 'alice')).toEqual(['alice', 'bob']);
    });
  });

  describe('createGroupKey', () => {
    it('створює детермінований ключ групи з відсортованих ідентифікаторів', () => {
      expect(createGroupKey([10, 2, 5])).toBe('2:5:10');
      expect(createGroupKey(['charlie', 'alice', 'bob'])).toBe('alice:bob:charlie');
    });
  });

  describe('calculatePairScore', () => {
    it('обчислює зважену суму трьох сигналів', () => {
      const signals = createMockSignals(0.8, 0.5, 0.4);
      // 0.5 * 0.8 + 0.3 * 0.5 + 0.2 * 0.4 = 0.4 + 0.15 + 0.08 = 0.63
      const score = calculatePairScore(signals, profile);
      expect(score).toBeCloseTo(0.63, 5);
    });

    it('повертає нуль, якщо всі сигнали нульові', () => {
      const signals = createMockSignals(0, 0, 0);
      const score = calculatePairScore(signals, profile);
      expect(score).toBe(0);
    });

    it('обмежує максимальний скор одиницею', () => {
      const customWeights = { wText: 0.8, wCoactivity: 0.8, wCosharing: 0.8 };
      const signals = createMockSignals(1, 1, 1);
      const score = calculatePairScore(signals, customWeights);
      expect(score).toBe(1);
    });
  });

  describe('extractCoordinatedGroups', () => {
    it('повертає порожній масив, якщо немає пар з досягнутим edgeThreshold', () => {
      const pairs: ScoredPair[] = [
        {
          participantAId: 1,
          participantBId: 2,
          score: 0.3,
          signals: createMockSignals(0.3, 0.3, 0.3),
        },
      ];

      const groups = extractCoordinatedGroups(pairs, profile);
      expect(groups).toEqual([]);
    });

    it('виділяє групу з двох учасників при наявності ребра', () => {
      const pairs: ScoredPair[] = [
        {
          participantAId: 1,
          participantBId: 2,
          score: 0.8,
          signals: createMockSignals(0.8, 0.8, 0.8),
        },
      ];

      const groups = extractCoordinatedGroups(pairs, profile);
      expect(groups).toHaveLength(1);
      expect(groups[0].groupKey).toBe('1:2');
      expect(groups[0].participantIds).toEqual([1, 2]);
      expect(groups[0].score).toBe(0.8);
      expect(groups[0].edges).toHaveLength(1);
    });

    it('виділяє звʼязну компоненту у ланцюжку учасників і усереднює ваги ребер', () => {
      // Ланцюжок 1 - 2 - 3, пари (1, 3) немає в графі
      const pairs: ScoredPair[] = [
        {
          participantAId: 1,
          participantBId: 2,
          score: 0.8,
          signals: createMockSignals(0.8, 0.8, 0.8),
        },
        {
          participantAId: 2,
          participantBId: 3,
          score: 0.6,
          signals: createMockSignals(0.6, 0.6, 0.6),
        },
        {
          participantAId: 1,
          participantBId: 3,
          score: 0.2, // нижче edgeThreshold 0.5
          signals: createMockSignals(0.2, 0.2, 0.2),
        },
      ];

      const groups = extractCoordinatedGroups(pairs, profile);
      expect(groups).toHaveLength(1);
      expect(groups[0].groupKey).toBe('1:2:3');
      expect(groups[0].participantIds).toEqual([1, 2, 3]);
      // (0.8 + 0.6) / 2 = 0.7
      expect(groups[0].score).toBeCloseTo(0.7, 5);
      expect(groups[0].edges).toHaveLength(2);
    });

    it('виділяє кілька ізольованих компонент і сортує їх за спаданням скору', () => {
      const pairs: ScoredPair[] = [
        {
          participantAId: 1,
          participantBId: 2,
          score: 0.6,
          signals: createMockSignals(0.6, 0.6, 0.6),
        },
        {
          participantAId: 3,
          participantBId: 4,
          score: 0.9,
          signals: createMockSignals(0.9, 0.9, 0.9),
        },
      ];

      const groups = extractCoordinatedGroups(pairs, profile);
      expect(groups).toHaveLength(2);
      expect(groups[0].groupKey).toBe('3:4');
      expect(groups[0].score).toBe(0.9);
      expect(groups[1].groupKey).toBe('1:2');
      expect(groups[1].score).toBe(0.6);
    });

    it('при однакових скорах детерміновано сортує групи за ключем', () => {
      const pairs: ScoredPair[] = [
        {
          participantAId: 3,
          participantBId: 4,
          score: 0.7,
          signals: createMockSignals(0.7, 0.7, 0.7),
        },
        {
          participantAId: 1,
          participantBId: 2,
          score: 0.7,
          signals: createMockSignals(0.7, 0.7, 0.7),
        },
      ];

      const groups = extractCoordinatedGroups(pairs, profile);
      expect(groups).toHaveLength(2);
      expect(groups[0].groupKey).toBe('1:2');
      expect(groups[1].groupKey).toBe('3:4');
    });
  });

  describe('analyzeCoordination', () => {
    it('повертає порожні результати, якщо менше ніж два учасники з повідомленнями', () => {
      const participants: ParticipantMessages[] = [
        { participantId: 1, messages: [] },
        {
          participantId: 2,
          messages: [{ id: 1, sentAt: BASE_TIME, text: 'Текст повідомлення учасника' }],
        },
      ];

      const result = analyzeCoordination(participants, profile);
      expect(result.groups).toEqual([]);
      expect(result.edges).toEqual([]);
      expect(result.retainedPairs).toEqual([]);
    });

    it('виявляє скоординовану пару з доказами та зберігає сигнали вище keepThreshold', () => {
      const participants: ParticipantMessages[] = [
        {
          participantId: 1,
          messages: [
            {
              id: 101,
              sentAt: BASE_TIME,
              text: 'Термінова скоординована кампанія https://example.com #новини',
            },
          ],
        },
        {
          participantId: 2,
          messages: [
            {
              id: 102,
              sentAt: BASE_TIME + 5000,
              text: 'Термінова скоординована кампанія https://example.com #новини',
            },
          ],
        },
        {
          participantId: 3,
          messages: [
            {
              id: 103,
              sentAt: BASE_TIME + 2_000_000,
              text: 'Зовсім інший текст про повсякденні справи у вихідні дні',
            },
          ],
        },
      ];

      const result = analyzeCoordination(participants, profile);

      expect(result.groups).toHaveLength(1);
      expect(result.groups[0].groupKey).toBe('1:2');
      expect(result.groups[0].participantIds).toEqual([1, 2]);
      expect(result.groups[0].score).toBeGreaterThanOrEqual(profile.edgeThreshold);

      expect(result.edges).toHaveLength(1);
      expect(result.edges[0].participantAId).toBe(1);
      expect(result.edges[0].participantBId).toBe(2);
      expect(result.edges[0].signals.text.evidence).toHaveLength(1);

      // Пари з низьким скором можуть не потрапити навіть у keepThreshold
      const pairWith3 = result.retainedPairs.find(
        (pair) => pair.participantAId === 3 || pair.participantBId === 3,
      );
      expect(pairWith3).toBeUndefined();
    });
  });

  describe('analyzeCoordinationFromMessages', () => {
    it('групує сирі повідомлення за participantId та виділяє координовану групу', () => {
      const messages: DetectorMessage[] = [
        {
          id: 1,
          participantId: 10,
          sentAt: BASE_TIME,
          text: 'Спільна узгоджена позиція щодо голосування #вибори',
        },
        {
          id: 2,
          participantId: 20,
          sentAt: BASE_TIME + 2000,
          text: 'Спільна узгоджена позиція щодо голосування #вибори',
        },
        {
          id: 3,
          // Повідомлення без participantId ігнорується
          sentAt: BASE_TIME + 3000,
          text: 'Спільна узгоджена позиція щодо голосування #вибори',
        },
      ];

      const result = analyzeCoordinationFromMessages(messages, profile);
      expect(result.groups).toHaveLength(1);
      expect(result.groups[0].groupKey).toBe('10:20');
      expect(result.groups[0].participantIds).toEqual([10, 20]);
    });
  });
});

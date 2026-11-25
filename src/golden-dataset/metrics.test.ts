import { describe, expect, it } from 'vitest';
import { loadGoldenDatasetEntry } from '@/golden-dataset/golden-dataset';
import {
  calculatePairMetrics,
  countPairs,
  evaluateGoldenDataset,
  findPredictedGroups,
  MIN_F1_SCORE,
  toParticipantPairs,
} from '@/golden-dataset/metrics';

describe('toParticipantPairs', () => {
  it('розкладає групу з трьох учасників на три пари', () => {
    expect(toParticipantPairs([['alice', 'bob', 'carol']])).toEqual(
      new Set(['alice:bob', 'alice:carol', 'bob:carol']),
    );
  });

  it('дає ту саму пару незалежно від порядку учасників і не дублює її', () => {
    expect(
      toParticipantPairs([
        ['bob', 'alice'],
        ['alice', 'bob'],
      ]),
    ).toEqual(new Set(['alice:bob']));
  });

  it('повертає порожню множину, якщо груп немає', () => {
    expect(toParticipantPairs([]).size).toBe(0);
  });
});

describe('countPairs і calculatePairMetrics', () => {
  it('рахує влучні, хибні й пропущені пари', () => {
    const expectedPairs = toParticipantPairs([['alice', 'bob', 'carol']]);
    const predictedPairs = toParticipantPairs([
      ['alice', 'bob'],
      ['dave', 'eve'],
    ]);

    expect(countPairs(expectedPairs, predictedPairs)).toEqual({
      truePositives: 1,
      falsePositives: 1,
      falseNegatives: 2,
    });
  });

  it('обчислює precision, recall і F1 за формулами', () => {
    const metrics = calculatePairMetrics({
      truePositives: 1,
      falsePositives: 1,
      falseNegatives: 2,
    });

    expect(metrics.precision).toBe(0.5);
    expect(metrics.recall).toBeCloseTo(1 / 3);
    expect(metrics.f1).toBeCloseTo(0.4);
  });

  it('лишає метрики невизначеними, коли немає ні еталонних, ні знайдених пар', () => {
    expect(
      calculatePairMetrics({ truePositives: 0, falsePositives: 0, falseNegatives: 0 }),
    ).toEqual({
      truePositives: 0,
      falsePositives: 0,
      falseNegatives: 0,
      precision: null,
      recall: null,
      f1: null,
    });
  });

  it('дає F1 = 0, коли знайдено лише хибні пари і пропущено всі справжні', () => {
    const metrics = calculatePairMetrics({
      truePositives: 0,
      falsePositives: 2,
      falseNegatives: 3,
    });

    expect(metrics.precision).toBe(0);
    expect(metrics.recall).toBe(0);
    expect(metrics.f1).toBe(0);
  });

  it('лишає precision невизначеним, якщо система нічого не знайшла', () => {
    const metrics = calculatePairMetrics({
      truePositives: 0,
      falsePositives: 0,
      falseNegatives: 3,
    });

    expect(metrics.precision).toBeNull();
    expect(metrics.recall).toBe(0);
    expect(metrics.f1).toBeNull();
  });
});

describe('findPredictedGroups', () => {
  it('знаходить копіпаст-ферму в лозі тим самим шляхом, що й завантаження', () => {
    const entry = loadGoldenDatasetEntry('copy-paste-farm.json');

    const predictedGroups = findPredictedGroups(entry);

    expect(predictedGroups.map((group) => [...group].sort())).toEqual(entry.groundTruth);
  });

  it('не знаходить груп у лозі без координації', () => {
    expect(findPredictedGroups(loadGoldenDatasetEntry('two-friends.json'))).toEqual([]);
  });
});

describe('точність на Golden Dataset', () => {
  it(`загальний F1 на рівні пар учасників не нижчий за ${MIN_F1_SCORE}`, () => {
    const { entries, total } = evaluateGoldenDataset();

    expect(entries.length).toBeGreaterThanOrEqual(8);
    expect(total.f1).not.toBeNull();
    expect(total.f1).toBeGreaterThanOrEqual(MIN_F1_SCORE);
  });
});

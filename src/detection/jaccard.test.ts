import { describe, expect, it } from 'vitest';
import { calculateJaccardSimilarity } from './jaccard';

describe('calculateJaccardSimilarity', () => {
  it('повертає 1 для однакових множин', () => {
    expect(calculateJaccardSimilarity(new Set(['a', 'b', 'c']), new Set(['c', 'b', 'a']))).toBe(1);
  });

  it('повертає 0 для множин без спільних елементів', () => {
    expect(calculateJaccardSimilarity(new Set(['a', 'b']), new Set(['c', 'd']))).toBe(0);
  });

  it('ділить перетин на обʼєднання при частковому збігу', () => {
    // Intersection {b, c} = 2, union {a, b, c, d} = 4
    expect(calculateJaccardSimilarity(new Set(['a', 'b', 'c']), new Set(['b', 'c', 'd']))).toBe(
      0.5,
    );
  });

  it('дає однаковий результат незалежно від порядку аргументів', () => {
    const smallerSet = new Set([1, 2]);
    const largerSet = new Set([2, 3, 4, 5, 6]);

    expect(calculateJaccardSimilarity(smallerSet, largerSet)).toBe(
      calculateJaccardSimilarity(largerSet, smallerSet),
    );
    expect(calculateJaccardSimilarity(smallerSet, largerSet)).toBeCloseTo(1 / 6);
  });

  it('повертає 1/n, коли менша множина з одного елемента повністю входить у більшу', () => {
    expect(calculateJaccardSimilarity(new Set(['a']), new Set(['a', 'b', 'c', 'd']))).toBe(0.25);
  });

  it('повертає 0, якщо одна з множин порожня', () => {
    expect(calculateJaccardSimilarity(new Set<string>(), new Set(['a']))).toBe(0);
    expect(calculateJaccardSimilarity(new Set(['a']), new Set<string>())).toBe(0);
  });

  it('повертає 0 для двох порожніх множин, а не NaN', () => {
    expect(calculateJaccardSimilarity(new Set<string>(), new Set<string>())).toBe(0);
  });

  it('не змінює вхідні множини', () => {
    const setA = new Set(['a', 'b']);
    const setB = new Set(['b', 'c']);

    calculateJaccardSimilarity(setA, setB);

    expect([...setA]).toEqual(['a', 'b']);
    expect([...setB]).toEqual(['b', 'c']);
  });
});

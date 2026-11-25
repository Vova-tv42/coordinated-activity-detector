import { describe, expect, it } from 'vitest';
import type { SourceLiveData } from '@/db/snapshots';
import { buildCoordinationGraph } from '@/lib/coordination-graph';

function createPair(
  key: string,
  participantAName: string,
  participantBName: string,
  score: number,
): SourceLiveData['pairs'][number] {
  return {
    key,
    participantAName,
    participantBName,
    signals: { text: score, coactivity: 0, cosharing: 0 },
    score,
  };
}

describe('buildCoordinationGraph', () => {
  it('повертає порожній граф, якщо немає пар', () => {
    const graph = buildCoordinationGraph([], [], 0.5);

    expect(graph).toEqual({ nodes: [], links: [] });
  });

  it('відфільтровує пари зі скором нижче edgeThreshold', () => {
    const pairs = [createPair('1:2', 'Alice', 'Bob', 0.49), createPair('2:3', 'Bob', 'Carol', 0.5)];
    const groups: SourceLiveData['groups'] = [
      { id: 10, score: 0.5, memberNames: ['Bob', 'Carol'] },
    ];

    const graph = buildCoordinationGraph(groups, pairs, 0.5);

    expect(graph.links).toEqual([{ source: 'Bob', target: 'Carol', value: 0.5 }]);
    expect(graph.nodes).toEqual([
      { id: 'Bob', name: 'Bob', group: 10 },
      { id: 'Carol', name: 'Carol', group: 10 },
    ]);
  });

  it('призначає різним групам різні ідентифікатори group для розфарбування', () => {
    const groups: SourceLiveData['groups'] = [
      { id: 1, score: 0.9, memberNames: ['Alice', 'Bob'] },
      { id: 2, score: 0.7, memberNames: ['Carol', 'Dave'] },
    ];
    const pairs = [createPair('1:2', 'Alice', 'Bob', 0.9), createPair('3:4', 'Carol', 'Dave', 0.7)];

    const graph = buildCoordinationGraph(groups, pairs, 0.5);

    expect(graph.nodes).toEqual([
      { id: 'Alice', name: 'Alice', group: 1 },
      { id: 'Bob', name: 'Bob', group: 1 },
      { id: 'Carol', name: 'Carol', group: 2 },
      { id: 'Dave', name: 'Dave', group: 2 },
    ]);
    expect(graph.links).toEqual([
      { source: 'Alice', target: 'Bob', value: 0.9 },
      { source: 'Carol', target: 'Dave', value: 0.7 },
    ]);
  });

  it('використовує 0 як резервну групу, якщо учасника не знайдено серед груп', () => {
    const pairs = [createPair('1:2', 'Alice', 'Bob', 0.8)];

    const graph = buildCoordinationGraph([], pairs, 0.5);

    expect(graph.nodes).toEqual([
      { id: 'Alice', name: 'Alice', group: 0 },
      { id: 'Bob', name: 'Bob', group: 0 },
    ]);
  });
});

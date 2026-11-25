import { describe, expect, it } from 'vitest';
import type { SourceLiveData } from '@/db/snapshots';
import { buildCoordinationGraph } from '@/lib/coordination-graph';

type Participant = { id: number; name: string };

const alice = { id: 1, name: 'Alice' };
const bob = { id: 2, name: 'Bob' };
const carol = { id: 3, name: 'Carol' };
const dave = { id: 4, name: 'Dave' };

function createPair(
  participantA: Participant,
  participantB: Participant,
  score: number,
): SourceLiveData['pairs'][number] {
  return {
    key: `${participantA.id}:${participantB.id}`,
    participantAId: participantA.id,
    participantBId: participantB.id,
    participantAName: participantA.name,
    participantBName: participantB.name,
    signals: { text: score, coactivity: 0, cosharing: 0 },
    score,
  };
}

function createGroup(id: number, score: number, members: Participant[]) {
  return {
    id,
    score,
    memberIds: members.map((member) => member.id),
    memberNames: members.map((member) => member.name),
  };
}

describe('buildCoordinationGraph', () => {
  it('повертає порожній граф, якщо немає пар', () => {
    const graph = buildCoordinationGraph([], [], 0.5);

    expect(graph).toEqual({ nodes: [], links: [] });
  });

  it('відфільтровує пари зі скором нижче edgeThreshold', () => {
    const pairs = [createPair(alice, bob, 0.49), createPair(bob, carol, 0.5)];
    const groups = [createGroup(10, 0.5, [bob, carol])];

    const graph = buildCoordinationGraph(groups, pairs, 0.5);

    expect(graph.links).toEqual([{ source: '2', target: '3', value: 0.5 }]);
    expect(graph.nodes).toEqual([
      { id: '2', name: 'Bob', group: 10 },
      { id: '3', name: 'Carol', group: 10 },
    ]);
  });

  it('призначає різним групам різні ідентифікатори group для розфарбування', () => {
    const groups = [createGroup(1, 0.9, [alice, bob]), createGroup(2, 0.7, [carol, dave])];
    const pairs = [createPair(alice, bob, 0.9), createPair(carol, dave, 0.7)];

    const graph = buildCoordinationGraph(groups, pairs, 0.5);

    expect(graph.nodes).toEqual([
      { id: '1', name: 'Alice', group: 1 },
      { id: '2', name: 'Bob', group: 1 },
      { id: '3', name: 'Carol', group: 2 },
      { id: '4', name: 'Dave', group: 2 },
    ]);
    expect(graph.links).toEqual([
      { source: '1', target: '2', value: 0.9 },
      { source: '3', target: '4', value: 0.7 },
    ]);
  });

  it('використовує 0 як резервну групу, якщо учасника не знайдено серед груп', () => {
    const pairs = [createPair(alice, bob, 0.8)];

    const graph = buildCoordinationGraph([], pairs, 0.5);

    expect(graph.nodes).toEqual([
      { id: '1', name: 'Alice', group: 0 },
      { id: '2', name: 'Bob', group: 0 },
    ]);
  });

  it('показує різних учасників з однаковим імʼям окремими вузлами', () => {
    const firstOleksandr = { id: 5, name: 'Олександр' };
    const secondOleksandr = { id: 6, name: 'Олександр' };
    const groups = [
      createGroup(1, 0.9, [firstOleksandr, alice]),
      createGroup(2, 0.8, [secondOleksandr, bob]),
    ];
    const pairs = [createPair(firstOleksandr, alice, 0.9), createPair(secondOleksandr, bob, 0.8)];

    const graph = buildCoordinationGraph(groups, pairs, 0.5);

    expect(graph.nodes).toHaveLength(4);
    expect(graph.nodes.filter((node) => node.name === 'Олександр')).toEqual([
      { id: '5', name: 'Олександр', group: 1 },
      { id: '6', name: 'Олександр', group: 2 },
    ]);
    expect(graph.links).toEqual([
      { source: '5', target: '1', value: 0.9 },
      { source: '6', target: '2', value: 0.8 },
    ]);
  });

  it('додає учасника, що є в кількох парах, лише один раз', () => {
    const pairs = [createPair(alice, bob, 0.9), createPair(alice, carol, 0.7)];

    const graph = buildCoordinationGraph([createGroup(1, 0.8, [alice, bob, carol])], pairs, 0.5);

    expect(graph.nodes.map((node) => node.id)).toEqual(['1', '2', '3']);
  });
});

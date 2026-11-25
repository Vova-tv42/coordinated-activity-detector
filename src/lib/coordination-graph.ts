import type { SourceLiveData } from '@/db/snapshots';

export type CoordinationGraphNode = {
  id: string;
  name: string;
  group: number;
};

export type CoordinationGraphLink = {
  source: string;
  target: string;
  value: number;
};

export type CoordinationGraphData = {
  nodes: CoordinationGraphNode[];
  links: CoordinationGraphLink[];
};

const NO_GROUP = 0;

export function buildCoordinationGraph(
  groups: SourceLiveData['groups'],
  pairs: SourceLiveData['pairs'],
  edgeThreshold: number,
): CoordinationGraphData {
  const groupByParticipantId = new Map<number, number>();
  for (const group of groups) {
    for (const memberId of group.memberIds) {
      groupByParticipantId.set(memberId, group.id);
    }
  }

  // Nodes are keyed by participant id, because different people in a chat can share a name
  const nodesByParticipantId = new Map<number, CoordinationGraphNode>();
  const links: CoordinationGraphLink[] = [];

  function addNode(participantId: number, name: string) {
    nodesByParticipantId.set(participantId, {
      id: String(participantId),
      name,
      group: groupByParticipantId.get(participantId) ?? NO_GROUP,
    });
  }

  for (const pair of pairs) {
    const isGraphEdge = pair.score >= edgeThreshold;
    if (!isGraphEdge) {
      continue;
    }

    addNode(pair.participantAId, pair.participantAName);
    addNode(pair.participantBId, pair.participantBName);
    links.push({
      source: String(pair.participantAId),
      target: String(pair.participantBId),
      value: pair.score,
    });
  }

  return { nodes: [...nodesByParticipantId.values()], links };
}

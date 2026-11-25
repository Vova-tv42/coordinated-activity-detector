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

export function buildCoordinationGraph(
  groups: SourceLiveData['groups'],
  pairs: SourceLiveData['pairs'],
  edgeThreshold: number,
): CoordinationGraphData {
  const groupByParticipantName = new Map<string, number>();
  for (const group of groups) {
    for (const memberName of group.memberNames) {
      groupByParticipantName.set(memberName, group.id);
    }
  }

  const nodeNames = new Set<string>();
  const links: CoordinationGraphLink[] = [];

  for (const pair of pairs) {
    const isGraphEdge = pair.score >= edgeThreshold;
    if (!isGraphEdge) {
      continue;
    }

    nodeNames.add(pair.participantAName);
    nodeNames.add(pair.participantBName);
    links.push({
      source: pair.participantAName,
      target: pair.participantBName,
      value: pair.score,
    });
  }

  const nodes: CoordinationGraphNode[] = [...nodeNames].map((name) => ({
    id: name,
    name,
    group: groupByParticipantName.get(name) ?? 0,
  }));

  return { nodes, links };
}

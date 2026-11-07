import { detectPairSignals } from './detectors';
import type {
  CoordinatedGroup,
  CoordinationAnalysisResult,
  DetectionProfileConfig,
  DetectorMessage,
  GraphThresholdProfile,
  ParticipantId,
  ParticipantMessages,
  ScoredPair,
  ScoreWeightsProfile,
} from './types';

const EMPTY_COUNT = 0;
const MIN_GROUP_SIZE = 2;
const MIN_SCORE = 0;
const MAX_SCORE = 1;
const ZERO_SCORE = 0;
const COMPARISON_EQUAL = 0;
const START_INDEX = 0;
const INDEX_OFFSET = 1;
const GROUP_KEY_SEPARATOR = ':';

export function compareParticipantIds(idA: ParticipantId, idB: ParticipantId): number {
  return String(idA).localeCompare(String(idB), undefined, { numeric: true });
}

export function orderParticipantPair(
  idA: ParticipantId,
  idB: ParticipantId,
): [ParticipantId, ParticipantId] {
  const isAFirst = compareParticipantIds(idA, idB) <= COMPARISON_EQUAL;
  return isAFirst ? [idA, idB] : [idB, idA];
}

export function createGroupKey(participantIds: ParticipantId[]): string {
  const sortedIds = [...participantIds].sort(compareParticipantIds);
  return sortedIds.join(GROUP_KEY_SEPARATOR);
}

export function calculatePairScore(
  signals: {
    text: { value: number };
    coactivity: { value: number };
    cosharing: { value: number };
  },
  weights: ScoreWeightsProfile,
): number {
  const weightedTextScore = weights.wText * signals.text.value;
  const weightedCoactivityScore = weights.wCoactivity * signals.coactivity.value;
  const weightedCosharingScore = weights.wCosharing * signals.cosharing.value;

  const rawScore = weightedTextScore + weightedCoactivityScore + weightedCosharingScore;

  let finalScore = rawScore;
  const isNegative = rawScore < MIN_SCORE;
  if (isNegative) {
    finalScore = MIN_SCORE;
  }
  const isAboveMaximum = rawScore > MAX_SCORE;
  if (isAboveMaximum) {
    finalScore = MAX_SCORE;
  }

  return finalScore;
}

export function extractCoordinatedGroups<TMessage extends DetectorMessage>(
  scoredPairs: ScoredPair<TMessage>[],
  profile: Pick<GraphThresholdProfile, 'edgeThreshold'>,
): CoordinatedGroup<TMessage>[] {
  const qualifiedEdges = scoredPairs.filter((pair) => pair.score >= profile.edgeThreshold);
  if (qualifiedEdges.length === EMPTY_COUNT) {
    return [];
  }

  const adjacency = new Map<ParticipantId, Set<ParticipantId>>();
  for (const edge of qualifiedEdges) {
    const neighborsA = adjacency.get(edge.participantAId) ?? new Set<ParticipantId>();
    neighborsA.add(edge.participantBId);
    adjacency.set(edge.participantAId, neighborsA);

    const neighborsB = adjacency.get(edge.participantBId) ?? new Set<ParticipantId>();
    neighborsB.add(edge.participantAId);
    adjacency.set(edge.participantBId, neighborsB);
  }

  const visited = new Set<ParticipantId>();
  const groups: CoordinatedGroup<TMessage>[] = [];

  for (const startNode of adjacency.keys()) {
    const isAlreadyVisited = visited.has(startNode);
    if (isAlreadyVisited) {
      continue;
    }

    const componentMembers: ParticipantId[] = [];
    const queue: ParticipantId[] = [startNode];
    visited.add(startNode);

    while (queue.length > EMPTY_COUNT) {
      const currentNode = queue.shift();
      if (currentNode === undefined) {
        break;
      }
      componentMembers.push(currentNode);

      const neighbors = adjacency.get(currentNode);
      if (!neighbors) {
        continue;
      }

      for (const neighbor of neighbors) {
        const isNeighborUnvisited = !visited.has(neighbor);
        if (isNeighborUnvisited) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }

    const hasEnoughMembers = componentMembers.length >= MIN_GROUP_SIZE;
    if (!hasEnoughMembers) {
      continue;
    }

    const memberSet = new Set(componentMembers);
    const groupEdges = qualifiedEdges.filter((edge) => {
      const isBothEndpointsInGroup =
        memberSet.has(edge.participantAId) && memberSet.has(edge.participantBId);
      return isBothEndpointsInGroup;
    });

    const hasEdges = groupEdges.length > EMPTY_COUNT;
    const scoreSum = groupEdges.reduce((sum, edge) => sum + edge.score, ZERO_SCORE);
    const score = hasEdges ? scoreSum / groupEdges.length : ZERO_SCORE;

    const sortedParticipantIds = [...componentMembers].sort(compareParticipantIds);
    const groupKey = createGroupKey(sortedParticipantIds);

    groups.push({
      groupKey,
      participantIds: sortedParticipantIds,
      score,
      edges: groupEdges,
    });
  }

  groups.sort((groupA, groupB) => {
    const scoreDifference = groupB.score - groupA.score;
    const hasDifferentScores = scoreDifference !== COMPARISON_EQUAL;
    if (hasDifferentScores) {
      return scoreDifference;
    }
    return groupA.groupKey.localeCompare(groupB.groupKey);
  });

  return groups;
}

export function analyzeCoordination<TMessage extends DetectorMessage>(
  participants: ParticipantMessages<TMessage>[],
  profile: DetectionProfileConfig & GraphThresholdProfile,
): CoordinationAnalysisResult<TMessage> {
  const eligibleParticipants = participants.filter(
    (participant) => participant.messages.length > EMPTY_COUNT,
  );

  const hasFewerThanTwoParticipants = eligibleParticipants.length < MIN_GROUP_SIZE;
  if (hasFewerThanTwoParticipants) {
    return {
      groups: [],
      edges: [],
      retainedPairs: [],
    };
  }

  const allScoredPairs: ScoredPair<TMessage>[] = [];
  const keepThreshold = profile.keepThreshold ?? profile.edgeThreshold;

  for (let indexA = START_INDEX; indexA < eligibleParticipants.length; indexA += INDEX_OFFSET) {
    for (
      let indexB = indexA + INDEX_OFFSET;
      indexB < eligibleParticipants.length;
      indexB += INDEX_OFFSET
    ) {
      const participantA = eligibleParticipants[indexA];
      const participantB = eligibleParticipants[indexB];

      const [canonicalIdA, canonicalIdB] = orderParticipantPair(
        participantA.participantId,
        participantB.participantId,
      );

      const isAOriginalFirst = canonicalIdA === participantA.participantId;
      const [messagesA, messagesB] = isAOriginalFirst
        ? [participantA.messages, participantB.messages]
        : [participantB.messages, participantA.messages];

      const signals = detectPairSignals(messagesA, messagesB, profile);
      const score = calculatePairScore(signals, profile);

      allScoredPairs.push({
        participantAId: canonicalIdA,
        participantBId: canonicalIdB,
        score,
        signals,
      });
    }
  }

  const edges = allScoredPairs.filter((pair) => pair.score >= profile.edgeThreshold);
  const retainedPairs = allScoredPairs.filter((pair) => pair.score >= keepThreshold);
  const groups = extractCoordinatedGroups(edges, profile);

  return {
    groups,
    edges,
    retainedPairs,
  };
}

export function analyzeCoordinationFromMessages<TMessage extends DetectorMessage>(
  messages: TMessage[],
  profile: DetectionProfileConfig & GraphThresholdProfile,
): CoordinationAnalysisResult<TMessage> {
  const messagesByParticipant = new Map<ParticipantId, TMessage[]>();

  for (const message of messages) {
    const participantId = message.participantId;
    if (participantId === undefined) {
      continue;
    }

    const existingMessages = messagesByParticipant.get(participantId);
    if (existingMessages) {
      existingMessages.push(message);
    } else {
      messagesByParticipant.set(participantId, [message]);
    }
  }

  const participantEntries: ParticipantMessages<TMessage>[] = Array.from(
    messagesByParticipant.entries(),
  ).map(([participantId, participantMessages]) => ({
    participantId,
    messages: participantMessages,
  }));

  return analyzeCoordination(participantEntries, profile);
}

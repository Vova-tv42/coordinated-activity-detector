import { and, asc, desc, eq, gt, isNotNull, lte } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import type { AppDatabase } from '@/db/connection';
import { findSourceProfile } from '@/db/profiles';
import {
  evidence,
  findingMembers,
  findings,
  groupMembers,
  messages,
  pairSignals,
  participants,
  snapshotGroups,
  snapshots,
} from '@/db/schema';
import {
  analyzeCoordinationFromMessages,
  calculatePairScore,
  createGroupKey,
  type ScoreWeightsProfile,
} from '@/detection/detectors';

const MS_IN_MINUTE = 60_000;
const SIGNAL_KINDS = ['text', 'coactivity', 'cosharing'] as const;

type SignalKind = (typeof SIGNAL_KINDS)[number];

type SnapshotGroupView = {
  id: number;
  score: number;
  memberNames: string[];
};

type SnapshotPairView = {
  key: string;
  participantAName: string;
  participantBName: string;
  signals: Record<SignalKind, number>;
};

function selectWindowMessages(database: AppDatabase, sourceId: number, windowEnd: Date) {
  const profile = findSourceProfile(database, sourceId);
  if (!profile) {
    throw new Error(`Source ${sourceId} does not exist`);
  }

  const earliestWindowStart = new Date(windowEnd.getTime() - profile.windowMinutes * MS_IN_MINUTE);
  const windowMessages = database
    .select({
      id: messages.id,
      participantId: messages.participantId,
      sentAt: messages.sentAt,
      text: messages.text,
      normalizedText: messages.normalizedText,
    })
    .from(messages)
    .where(
      and(
        eq(messages.sourceId, sourceId),
        gt(messages.sentAt, earliestWindowStart),
        lte(messages.sentAt, windowEnd),
      ),
    )
    .orderBy(desc(messages.sentAt), desc(messages.id))
    .limit(profile.windowMaxMessages)
    .all();

  const oldestMessage = windowMessages.at(-1);
  const isCutByMessageLimit = windowMessages.length === profile.windowMaxMessages;
  const windowStart =
    isCutByMessageLimit && oldestMessage ? oldestMessage.sentAt : earliestWindowStart;

  return { profile, windowMessages, windowStart };
}

export function analyzeSource(database: AppDatabase, sourceId: number, windowEnd: Date) {
  const { profile, windowMessages, windowStart } = selectWindowMessages(
    database,
    sourceId,
    windowEnd,
  );
  const analysis = analyzeCoordinationFromMessages(windowMessages, profile);

  database.transaction((transaction) => {
    const findingIdsByGroupKey = new Map(
      transaction
        .select({ id: findings.id, groupKey: findings.groupKey })
        .from(findings)
        .where(and(eq(findings.sourceId, sourceId), isNotNull(findings.snapshotGroupId)))
        .all()
        .map((finding) => [finding.groupKey, finding.id]),
    );

    transaction.delete(snapshots).where(eq(snapshots.sourceId, sourceId)).run();
    const snapshot = transaction
      .insert(snapshots)
      .values({ sourceId, computedAt: windowEnd, windowStart, windowEnd })
      .returning({ id: snapshots.id })
      .get();

    const textSignalIdsByPairKey = new Map<string, number>();
    for (const pair of analysis.retainedPairs) {
      for (const signalKind of SIGNAL_KINDS) {
        const pairSignal = transaction
          .insert(pairSignals)
          .values({
            snapshotId: snapshot.id,
            participantAId: Number(pair.participantAId),
            participantBId: Number(pair.participantBId),
            signalKind,
            value: pair.signals[signalKind].value,
          })
          .returning({ id: pairSignals.id })
          .get();
        if (signalKind === 'text') {
          const pairKey = createGroupKey([pair.participantAId, pair.participantBId]);
          textSignalIdsByPairKey.set(pairKey, pairSignal.id);
        }
      }
    }

    for (const group of analysis.groups) {
      const memberIds = group.participantIds.map(Number);
      const snapshotGroup = transaction
        .insert(snapshotGroups)
        .values({ snapshotId: snapshot.id, score: group.score, memberCount: memberIds.length })
        .returning({ id: snapshotGroups.id })
        .get();
      transaction
        .insert(groupMembers)
        .values(
          memberIds.map((participantId) => ({ snapshotGroupId: snapshotGroup.id, participantId })),
        )
        .run();

      for (const edge of group.edges) {
        const pairKey = createGroupKey([edge.participantAId, edge.participantBId]);
        const textSignalId = textSignalIdsByPairKey.get(pairKey);
        const hasTextEvidence = textSignalId !== undefined && edge.signals.text.evidence.length > 0;
        if (!hasTextEvidence) {
          continue;
        }
        transaction
          .insert(evidence)
          .values(
            edge.signals.text.evidence.map((pairEvidence) => ({
              pairSignalId: textSignalId,
              messageAId: pairEvidence.messageA.id,
              messageBId: pairEvidence.messageB.id,
            })),
          )
          .run();
      }

      const existingFindingId = findingIdsByGroupKey.get(group.groupKey);
      if (existingFindingId !== undefined) {
        transaction
          .update(findings)
          .set({ snapshotGroupId: snapshotGroup.id })
          .where(eq(findings.id, existingFindingId))
          .run();
        continue;
      }

      // A group key lists all members, so a new key means a new group or a changed composition
      const finding = transaction
        .insert(findings)
        .values({
          sourceId,
          detectedAt: windowEnd,
          groupKey: group.groupKey,
          score: group.score,
          snapshotGroupId: snapshotGroup.id,
        })
        .returning({ id: findings.id })
        .get();
      transaction
        .insert(findingMembers)
        .values(memberIds.map((participantId) => ({ findingId: finding.id, participantId })))
        .run();
    }
  });
}

export function findLatestSnapshot(database: AppDatabase, sourceId: number) {
  return database
    .select({
      id: snapshots.id,
      computedAt: snapshots.computedAt,
      windowStart: snapshots.windowStart,
      windowEnd: snapshots.windowEnd,
    })
    .from(snapshots)
    .where(eq(snapshots.sourceId, sourceId))
    .orderBy(desc(snapshots.computedAt))
    .get();
}

export function listSnapshotGroups(database: AppDatabase, snapshotId: number) {
  const memberRows = database
    .select({
      groupId: snapshotGroups.id,
      score: snapshotGroups.score,
      memberName: participants.displayName,
    })
    .from(snapshotGroups)
    .innerJoin(groupMembers, eq(groupMembers.snapshotGroupId, snapshotGroups.id))
    .innerJoin(participants, eq(participants.id, groupMembers.participantId))
    .where(eq(snapshotGroups.snapshotId, snapshotId))
    .orderBy(desc(snapshotGroups.score), asc(snapshotGroups.id), asc(participants.displayName))
    .all();

  const groupsById = new Map<number, SnapshotGroupView>();
  for (const row of memberRows) {
    const group = groupsById.get(row.groupId) ?? {
      id: row.groupId,
      score: row.score,
      memberNames: [],
    };
    group.memberNames.push(row.memberName);
    groupsById.set(row.groupId, group);
  }
  return [...groupsById.values()];
}

// Scores are not stored, so they are recalculated with the weights of the current profile
export function listSnapshotPairs(
  database: AppDatabase,
  snapshotId: number,
  weights: ScoreWeightsProfile,
) {
  const participantA = alias(participants, 'participant_a');
  const participantB = alias(participants, 'participant_b');
  const signalRows = database
    .select({
      participantAId: pairSignals.participantAId,
      participantBId: pairSignals.participantBId,
      participantAName: participantA.displayName,
      participantBName: participantB.displayName,
      signalKind: pairSignals.signalKind,
      value: pairSignals.value,
    })
    .from(pairSignals)
    .innerJoin(participantA, eq(participantA.id, pairSignals.participantAId))
    .innerJoin(participantB, eq(participantB.id, pairSignals.participantBId))
    .where(eq(pairSignals.snapshotId, snapshotId))
    .all();

  const pairsByKey = new Map<string, SnapshotPairView>();
  for (const row of signalRows) {
    const key = createGroupKey([row.participantAId, row.participantBId]);
    const pair = pairsByKey.get(key) ?? {
      key,
      participantAName: row.participantAName,
      participantBName: row.participantBName,
      signals: { text: 0, coactivity: 0, cosharing: 0 },
    };
    pair.signals[row.signalKind] = row.value;
    pairsByKey.set(key, pair);
  }

  return [...pairsByKey.values()]
    .map((pair) => ({
      ...pair,
      score: calculatePairScore(
        {
          text: { value: pair.signals.text },
          coactivity: { value: pair.signals.coactivity },
          cosharing: { value: pair.signals.cosharing },
        },
        weights,
      ),
    }))
    .sort((pairA, pairB) => pairB.score - pairA.score);
}

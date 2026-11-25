import { asc, eq, max, min } from 'drizzle-orm';
import type { AppDatabase } from '@/db/connection';
import { findSourceProfile } from '@/db/profiles';
import { messages, windowMetrics } from '@/db/schema';
import { analyzeSource } from '@/db/snapshots';

const MS_IN_MINUTE = 60_000;
const STEPS_PER_WINDOW = 3;
const NO_COORDINATION_SCORE = 0;

export function listTimelineWindowEnds(
  firstMessageAt: Date,
  lastMessageAt: Date,
  windowMinutes: number,
) {
  const stepMs = (windowMinutes * MS_IN_MINUTE) / STEPS_PER_WINDOW;
  const windowEnds: Date[] = [];

  for (let windowEndMs = firstMessageAt.getTime() + stepMs; ; windowEndMs += stepMs) {
    windowEnds.push(new Date(windowEndMs));
    // Windows include their end, so the last one stops at or after the last message
    const coversLastMessage = windowEndMs >= lastMessageAt.getTime();
    if (coversLastMessage) {
      return windowEnds;
    }
  }
}

export function analyzeSourceTimeline(database: AppDatabase, sourceId: number) {
  const profile = findSourceProfile(database, sourceId);
  if (!profile) {
    throw new Error(`Source ${sourceId} does not exist`);
  }

  const messageRange = database
    .select({ firstMessageAt: min(messages.sentAt), lastMessageAt: max(messages.sentAt) })
    .from(messages)
    .where(eq(messages.sourceId, sourceId))
    .get();

  // better-sqlite3 turns the transaction inside analyzeSource into a savepoint
  database.transaction(() => {
    database.delete(windowMetrics).where(eq(windowMetrics.sourceId, sourceId)).run();
    if (!messageRange?.firstMessageAt || !messageRange.lastMessageAt) {
      return;
    }

    const windowEnds = listTimelineWindowEnds(
      messageRange.firstMessageAt,
      messageRange.lastMessageAt,
      profile.windowMinutes,
    );
    for (const windowEnd of windowEnds) {
      const { windowStart, analysis } = analyzeSource(database, sourceId, windowEnd);
      const flaggedParticipantIds = new Set(
        analysis.groups.flatMap((group) => group.participantIds),
      );

      database
        .insert(windowMetrics)
        .values({
          sourceId,
          windowStart,
          windowEnd,
          maxScore: Math.max(
            NO_COORDINATION_SCORE,
            ...analysis.retainedPairs.map((pair) => pair.score),
          ),
          groupCount: analysis.groups.length,
          flaggedParticipants: flaggedParticipantIds.size,
        })
        .run();
    }
  });
}

export function listWindowMetrics(database: AppDatabase, sourceId: number) {
  return database
    .select({
      windowStart: windowMetrics.windowStart,
      windowEnd: windowMetrics.windowEnd,
      maxScore: windowMetrics.maxScore,
      groupCount: windowMetrics.groupCount,
      flaggedParticipants: windowMetrics.flaggedParticipants,
    })
    .from(windowMetrics)
    .where(eq(windowMetrics.sourceId, sourceId))
    .orderBy(asc(windowMetrics.windowEnd))
    .all();
}

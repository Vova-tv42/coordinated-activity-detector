import { countDistinct, desc, eq } from 'drizzle-orm';
import type { AppDatabase } from '@/db/connection';
import { messages, participants, sources } from '@/db/schema';

export function listSourcesWithCounts(database: AppDatabase) {
  return database
    .select({
      id: sources.id,
      title: sources.title,
      kind: sources.kind,
      isActive: sources.isActive,
      participantCount: countDistinct(participants.id),
      messageCount: countDistinct(messages.id),
    })
    .from(sources)
    .leftJoin(participants, eq(participants.sourceId, sources.id))
    .leftJoin(messages, eq(messages.participantId, participants.id))
    .groupBy(sources.id)
    .orderBy(desc(sources.createdAt), desc(sources.id))
    .all();
}

export function findSource(database: AppDatabase, sourceId: number) {
  return database
    .select({ id: sources.id, title: sources.title, kind: sources.kind })
    .from(sources)
    .where(eq(sources.id, sourceId))
    .get();
}

export function listRecentMessages(database: AppDatabase, sourceId: number, limit: number) {
  return database
    .select({
      id: messages.id,
      sentAt: messages.sentAt,
      text: messages.text,
      authorName: participants.displayName,
    })
    .from(messages)
    .innerJoin(participants, eq(messages.participantId, participants.id))
    .where(eq(messages.sourceId, sourceId))
    .orderBy(desc(messages.sentAt), desc(messages.id))
    .limit(limit)
    .all();
}

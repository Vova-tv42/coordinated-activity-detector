import { eq, sql } from 'drizzle-orm';
import type { AppDatabase } from '@/db/connection';
import { messages, participants, sources } from '@/db/schema';
import { normalizeText } from '@/lib/normalize-text';

export type IncomingMessage = {
  sourceId: number;
  externalId: string;
  displayName: string;
  tgMessageId?: number;
  sentAt: Date;
  text: string;
};

export function findTelegramSourceId(database: AppDatabase, chatId: number) {
  const source = database
    .select({ id: sources.id })
    .from(sources)
    .where(eq(sources.tgChatId, chatId))
    .get();

  return source?.id;
}

export function saveIncomingMessage(database: AppDatabase, message: IncomingMessage) {
  database.transaction((transaction) => {
    const participant = transaction
      .insert(participants)
      .values({
        sourceId: message.sourceId,
        externalId: message.externalId,
        displayName: message.displayName,
        firstSeenAt: message.sentAt,
      })
      .onConflictDoUpdate({
        target: [participants.sourceId, participants.externalId],
        set: { displayName: message.displayName },
      })
      .returning({ id: participants.id })
      .get();

    const savedMessage = transaction
      .insert(messages)
      .values({
        sourceId: message.sourceId,
        participantId: participant.id,
        tgMessageId: message.tgMessageId,
        sentAt: message.sentAt,
        text: message.text,
        normalizedText: normalizeText(message.text),
      })
      .onConflictDoNothing({ target: [messages.sourceId, messages.tgMessageId] })
      .returning({ id: messages.id })
      .get();

    const isRedeliveredMessage = !savedMessage;
    if (isRedeliveredMessage) {
      return;
    }

    transaction
      .update(participants)
      .set({ messageCount: sql`${participants.messageCount} + 1` })
      .where(eq(participants.id, participant.id))
      .run();
  });
}

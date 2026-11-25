import { eq, sql } from 'drizzle-orm';
import type { AppDatabase } from '@/db/connection';
import { detectionProfiles, messages, participants, sources } from '@/db/schema';
import { normalizeText } from '@/lib/normalize-text';
import type { ChatLog } from '@/upload/chat-log';

export type IncomingMessage = {
  sourceId: number;
  externalId: string;
  displayName: string;
  tgMessageId?: number;
  sentAt: Date;
  text: string;
};

export const DEFAULT_PROFILE_NAME = 'Стандартний';

export type TelegramGroup = {
  chatId: number;
  title: string;
};

export function registerTelegramSource(database: AppDatabase, group: TelegramGroup) {
  const defaultProfile = database
    .select({ id: detectionProfiles.id })
    .from(detectionProfiles)
    .where(eq(detectionProfiles.name, DEFAULT_PROFILE_NAME))
    .get();
  if (!defaultProfile) {
    throw new Error(`Detection profile "${DEFAULT_PROFILE_NAME}" is missing, run migrations`);
  }

  return database
    .insert(sources)
    .values({
      kind: 'telegram',
      tgChatId: group.chatId,
      title: group.title,
      profileId: defaultProfile.id,
    })
    .onConflictDoUpdate({ target: sources.tgChatId, set: { title: group.title } })
    .returning({ id: sources.id })
    .get().id;
}

export function findTelegramSourceId(database: AppDatabase, chatId: number) {
  const source = database
    .select({ id: sources.id })
    .from(sources)
    .where(eq(sources.tgChatId, chatId))
    .get();

  return source?.id;
}

export function saveUploadedChatLog(database: AppDatabase, chatLog: ChatLog, profileId: number) {
  // better-sqlite3 turns the nested transaction in saveIncomingMessage into a savepoint
  return database.transaction(() => {
    const sourceId = database
      .insert(sources)
      .values({ kind: 'upload', title: chatLog.sourceName, profileId })
      .returning({ id: sources.id })
      .get().id;

    // Sorted so that each participant gets the time of their earliest message as first_seen_at
    const messagesInTimeOrder = chatLog.messages.toSorted(
      (first, second) => first.at.getTime() - second.at.getTime(),
    );
    for (const message of messagesInTimeOrder) {
      saveIncomingMessage(database, {
        sourceId,
        externalId: message.author,
        displayName: message.author,
        sentAt: message.at,
        text: message.text,
      });
    }

    return sourceId;
  });
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

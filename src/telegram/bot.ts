import { Bot, webhookCallback } from 'grammy';
import type { Chat, ChatMember, ChatMemberUpdated, Message, UserFromGetMe } from 'grammy/types';
import type { AppDatabase } from '@/db/connection';
import { findTelegramSourceId, registerTelegramSource, saveIncomingMessage } from '@/db/ingest';
import { mapTelegramMessage } from '@/telegram/message-mapping';

export const TELEGRAM_WEBHOOK_PATH = '/api/telegram/webhook';
export const TELEGRAM_ALLOWED_UPDATES = ['message', 'my_chat_member'] as const;

const BOT_JOINED_STATUSES = new Set<ChatMember['status']>(['member', 'administrator']);

type TelegramSettings = {
  token: string;
  secretToken: string;
};

type TelegramWebhookOptions = TelegramSettings & {
  database: AppDatabase;
  botInfo?: UserFromGetMe;
  onMessageSaved?: (sourceId: number) => void;
};

export function readTelegramSettings(): TelegramSettings {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const secretToken = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!token || !secretToken) {
    throw new Error('TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET must be set');
  }

  return { token, secretToken };
}

function saveTelegramMessage(
  database: AppDatabase,
  message: Message,
  onMessageSaved?: (sourceId: number) => void,
) {
  const chatMessage = mapTelegramMessage(message);
  if (!chatMessage) {
    return;
  }

  const { chatId, ...incomingMessage } = chatMessage;
  const sourceId = findTelegramSourceId(database, chatId);
  // A chat becomes a source only when the bot is added to it, other chats are not analyzed
  if (!sourceId) {
    return;
  }

  saveIncomingMessage(database, { sourceId, ...incomingMessage });
  onMessageSaved?.(sourceId);
}

function registerGroupWhenBotJoins(
  database: AppDatabase,
  {
    chat,
    new_chat_member: botMembership,
  }: ChatMemberUpdated & { chat: Chat.GroupChat | Chat.SupergroupChat },
) {
  const hasBotJoined = BOT_JOINED_STATUSES.has(botMembership.status);
  if (!hasBotJoined) {
    return;
  }

  registerTelegramSource(database, { chatId: chat.id, title: chat.title });
}

export function createTelegramWebhookHandler({
  token,
  secretToken,
  database,
  botInfo,
  onMessageSaved,
}: TelegramWebhookOptions) {
  const bot = new Bot(token, { botInfo });
  bot.on('message', (context) => saveTelegramMessage(database, context.message, onMessageSaved));
  bot
    .chatType(['group', 'supergroup'])
    .on('my_chat_member', (context) => registerGroupWhenBotJoins(database, context.myChatMember));

  return webhookCallback(bot, 'std/http', { secretToken });
}

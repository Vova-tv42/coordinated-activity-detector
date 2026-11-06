import { Bot, webhookCallback } from 'grammy';
import type { Message, UserFromGetMe } from 'grammy/types';
import type { AppDatabase } from '@/db/connection';
import { findTelegramSourceId, saveIncomingMessage } from '@/db/ingest';
import { mapTelegramMessage } from '@/telegram/message-mapping';

export const TELEGRAM_WEBHOOK_PATH = '/api/telegram/webhook';
export const TELEGRAM_ALLOWED_UPDATES = ['message', 'my_chat_member'] as const;

type TelegramSettings = {
  token: string;
  secretToken: string;
};

type TelegramWebhookOptions = TelegramSettings & {
  database: AppDatabase;
  botInfo?: UserFromGetMe;
};

export function readTelegramSettings(): TelegramSettings {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const secretToken = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!token || !secretToken) {
    throw new Error('TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET must be set');
  }

  return { token, secretToken };
}

function saveTelegramMessage(database: AppDatabase, message: Message) {
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
}

export function createTelegramWebhookHandler({
  token,
  secretToken,
  database,
  botInfo,
}: TelegramWebhookOptions) {
  const bot = new Bot(token, { botInfo });
  bot.on('message', (context) => saveTelegramMessage(database, context.message));

  return webhookCallback(bot, 'std/http', { secretToken });
}

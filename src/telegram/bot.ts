import { Bot, webhookCallback } from 'grammy';
import type { UserFromGetMe } from 'grammy/types';

export const TELEGRAM_WEBHOOK_PATH = '/api/telegram/webhook';
export const TELEGRAM_ALLOWED_UPDATES = ['message', 'my_chat_member'] as const;

type TelegramSettings = {
  token: string;
  secretToken: string;
};

type TelegramWebhookOptions = TelegramSettings & {
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

export function createTelegramWebhookHandler({
  token,
  secretToken,
  botInfo,
}: TelegramWebhookOptions) {
  const bot = new Bot(token, { botInfo });

  return webhookCallback(bot, 'std/http', { secretToken });
}

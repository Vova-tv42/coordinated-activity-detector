import { Api } from 'grammy';
import {
  readTelegramSettings,
  TELEGRAM_ALLOWED_UPDATES,
  TELEGRAM_WEBHOOK_PATH,
} from '@/telegram/bot';

const publicUrl = process.argv[2] ?? process.env.PUBLIC_URL;
if (!publicUrl) {
  throw new Error('Pass the public URL as an argument or set PUBLIC_URL');
}

const { token, secretToken } = readTelegramSettings();
const api = new Api(token);
const webhookUrl = new URL(TELEGRAM_WEBHOOK_PATH, publicUrl).href;

await api.setWebhook(webhookUrl, {
  secret_token: secretToken,
  allowed_updates: [...TELEGRAM_ALLOWED_UPDATES],
});

const webhookInfo = await api.getWebhookInfo();
process.stdout.write(`${JSON.stringify(webhookInfo, null, 2)}\n`);

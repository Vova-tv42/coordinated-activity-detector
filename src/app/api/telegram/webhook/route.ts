import { getDatabase } from '@/db/connection';
import { createTelegramWebhookHandler, readTelegramSettings } from '@/telegram/bot';

let handleTelegramUpdate: ((request: Request) => Promise<Response>) | undefined;

export function POST(request: Request) {
  handleTelegramUpdate ??= createTelegramWebhookHandler({
    ...readTelegramSettings(),
    database: getDatabase(),
  });
  return handleTelegramUpdate(request);
}

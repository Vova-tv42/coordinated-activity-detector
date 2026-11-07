import { getDatabase } from '@/db/connection';
import { analyzeSource } from '@/db/snapshots';
import { createAnalysisTrigger } from '@/lib/analysis-trigger';
import { createTelegramWebhookHandler, readTelegramSettings } from '@/telegram/bot';

let handleTelegramUpdate: ((request: Request) => Promise<Response>) | undefined;

function createWebhookHandler() {
  const database = getDatabase();
  return createTelegramWebhookHandler({
    ...readTelegramSettings(),
    database,
    onMessageSaved: createAnalysisTrigger((sourceId) =>
      analyzeSource(database, sourceId, new Date()),
    ),
  });
}

export function POST(request: Request) {
  handleTelegramUpdate ??= createWebhookHandler();
  return handleTelegramUpdate(request);
}

import { connection } from 'next/server';
import { Suspense } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { UploadChatLogForm } from '@/components/upload-chat-log-form';
import { getDatabase } from '@/db/connection';
import { listDetectionProfiles } from '@/db/profiles';
import { MAX_CHAT_LOG_FILE_SIZE_MB } from '@/upload/chat-log';

async function UploadForm() {
  // SQLite reads are synchronous, so Next cannot detect them and would prerender the page at build time
  await connection();
  const profiles = listDetectionProfiles(getDatabase());

  return <UploadChatLogForm profiles={profiles} />;
}

export default function UploadPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Завантаження логу чату</CardTitle>
        <CardDescription>
          JSON-файл до {MAX_CHAT_LOG_FILE_SIZE_MB} МБ з назвою джерела (sourceName) і списком
          повідомлень (messages), де кожне має автора (author), час (at) і текст (text).
        </CardDescription>
        <CardAction>
          <Button variant="outline" size="sm" asChild>
            <a href="/examples/chat-log-example.json" download>
              Приклад файлу
            </a>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <Suspense fallback={<p className="text-muted-foreground">Завантаження...</p>}>
          <UploadForm />
        </Suspense>
      </CardContent>
    </Card>
  );
}

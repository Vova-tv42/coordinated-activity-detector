import { getDatabase } from '@/db/connection';
import { saveUploadedChatLog } from '@/db/ingest';
import { listDetectionProfiles } from '@/db/profiles';
import { analyzeSourceTimeline } from '@/db/timeline';
import {
  MAX_CHAT_LOG_FILE_SIZE_BYTES,
  MAX_CHAT_LOG_FILE_SIZE_MB,
  parseChatLog,
} from '@/upload/chat-log';

export type UploadResponseBody = { sourceId: number } | { errors: string[] };

function rejectUpload(errors: string[]) {
  return Response.json({ errors } satisfies UploadResponseBody, { status: 400 });
}

export async function POST(request: Request) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return rejectUpload(['Запит має містити форму з файлом і профілем.']);
  }

  const file = formData.get('file');
  const isNonEmptyFile = file instanceof File && file.size > 0;
  if (!isNonEmptyFile) {
    return rejectUpload(['Оберіть непорожній JSON-файл з логом чату.']);
  }
  if (file.size > MAX_CHAT_LOG_FILE_SIZE_BYTES) {
    return rejectUpload([`Файл більший за ${MAX_CHAT_LOG_FILE_SIZE_MB} МБ.`]);
  }

  const database = getDatabase();
  const profileId = Number(formData.get('profileId'));
  const isKnownProfile = listDetectionProfiles(database).some(
    (profile) => profile.id === profileId,
  );
  if (!isKnownProfile) {
    return rejectUpload(['Оберіть профіль аналізу зі списку.']);
  }

  const result = parseChatLog(await file.text());
  if (!result.success) {
    return rejectUpload(result.errors);
  }

  const sourceId = saveUploadedChatLog(database, result.chatLog, profileId);
  analyzeSourceTimeline(database, sourceId);
  return Response.json({ sourceId } satisfies UploadResponseBody, { status: 201 });
}

import { z } from 'zod';

export const MAX_CHAT_LOG_FILE_SIZE_MB = 5;
export const MAX_CHAT_LOG_FILE_SIZE_BYTES = MAX_CHAT_LOG_FILE_SIZE_MB * 1024 * 1024;
export const MAX_REPORTED_ERRORS = 20;

const MAX_SOURCE_NAME_LENGTH = 200;
const MAX_AUTHOR_LENGTH = 100;
// Same limit as a Telegram message, so uploaded logs look like real chats
const MAX_TEXT_LENGTH = 4096;

const chatLogMessageSchema = z.object(
  {
    author: z
      .string({ error: 'поле "author" має бути рядком з іменем автора.' })
      .trim()
      .min(1, 'поле "author" не може бути порожнім.')
      .max(MAX_AUTHOR_LENGTH, `поле "author" довше за ${MAX_AUTHOR_LENGTH} символів.`),
    at: z.iso
      .datetime({
        offset: true,
        error:
          'поле "at" має бути датою у форматі ISO 8601 з часовою зоною, наприклад 2026-09-10T12:00:00Z.',
      })
      .transform((sentAt) => new Date(sentAt)),
    text: z
      .string({ error: 'поле "text" має бути рядком з текстом повідомлення.' })
      .regex(/\S/, 'поле "text" не може бути порожнім.')
      .max(MAX_TEXT_LENGTH, `поле "text" довше за ${MAX_TEXT_LENGTH} символів.`),
  },
  { error: 'повідомлення має бути об\'єктом з полями "author", "at" і "text".' },
);

const chatLogSchema = z.object(
  {
    sourceName: z
      .string({ error: 'Поле "sourceName" має бути рядком з назвою джерела.' })
      .trim()
      .min(1, 'Поле "sourceName" не може бути порожнім.')
      .max(
        MAX_SOURCE_NAME_LENGTH,
        `Поле "sourceName" довше за ${MAX_SOURCE_NAME_LENGTH} символів.`,
      ),
    messages: z
      .array(chatLogMessageSchema, { error: 'Поле "messages" має бути масивом повідомлень.' })
      .min(1, 'Файл не містить жодного повідомлення.'),
  },
  { error: 'Файл має бути JSON-об\'єктом з полями "sourceName" і "messages".' },
);

export type ChatLog = z.infer<typeof chatLogSchema>;

export type ChatLogParseResult =
  | { success: true; chatLog: ChatLog }
  | { success: false; errors: string[] };

function describeIssue(issue: z.core.$ZodIssue) {
  const [field, messageIndex] = issue.path;
  const isMessageIssue = field === 'messages' && typeof messageIndex === 'number';

  return isMessageIssue ? `Повідомлення №${messageIndex + 1}: ${issue.message}` : issue.message;
}

function limitReportedErrors(errors: string[]) {
  if (errors.length <= MAX_REPORTED_ERRORS) {
    return errors;
  }

  const hiddenErrorCount = errors.length - MAX_REPORTED_ERRORS;
  return [...errors.slice(0, MAX_REPORTED_ERRORS), `І ще помилок: ${hiddenErrorCount}.`];
}

export function parseChatLog(fileContent: string): ChatLogParseResult {
  let json: unknown;
  try {
    json = JSON.parse(fileContent);
  } catch {
    return { success: false, errors: ['Файл не є коректним JSON.'] };
  }

  const result = chatLogSchema.safeParse(json);
  if (!result.success) {
    return { success: false, errors: limitReportedErrors(result.error.issues.map(describeIssue)) };
  }

  return { success: true, chatLog: result.data };
}

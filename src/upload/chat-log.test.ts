import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MAX_REPORTED_ERRORS, parseChatLog } from '@/upload/chat-log';

const validMessage = { author: 'alice', at: '2026-09-10T12:00:00Z', text: 'Привіт усім' };

function toFileContent(chatLog: unknown) {
  return JSON.stringify(chatLog);
}

function parseErrors(fileContent: string) {
  const result = parseChatLog(fileContent);
  if (result.success) {
    throw new Error('Expected the chat log to be rejected');
  }
  return result.errors;
}

describe('parseChatLog', () => {
  it('приймає коректний файл і перетворює час на дату', () => {
    const result = parseChatLog(
      toFileContent({
        sourceName: 'Демо-чат',
        messages: [validMessage, { author: 'bob', at: '2026-09-10T14:00:31+02:00', text: 'Так' }],
      }),
    );

    expect(result).toEqual({
      success: true,
      chatLog: {
        sourceName: 'Демо-чат',
        messages: [
          { author: 'alice', at: new Date('2026-09-10T12:00:00Z'), text: 'Привіт усім' },
          { author: 'bob', at: new Date('2026-09-10T12:00:31Z'), text: 'Так' },
        ],
      },
    });
  });

  it('приймає приклад файлу, який сторінка завантаження пропонує скачати', () => {
    const exampleContent = readFileSync(
      join(process.cwd(), 'public/examples/chat-log-example.json'),
      'utf8',
    );

    expect(parseChatLog(exampleContent).success).toBe(true);
  });

  it('обрізає пробіли в назві джерела та імені автора, але не в тексті', () => {
    const result = parseChatLog(
      toFileContent({
        sourceName: '  Демо-чат ',
        messages: [{ ...validMessage, author: ' alice ', text: '  текст  ' }],
      }),
    );

    expect(result.success && result.chatLog.sourceName).toBe('Демо-чат');
    expect(result.success && result.chatLog.messages[0]).toMatchObject({
      author: 'alice',
      text: '  текст  ',
    });
  });

  it('відхиляє файл, який не є JSON', () => {
    expect(parseErrors('{ "sourceName": ')).toEqual(['Файл не є коректним JSON.']);
  });

  it("відхиляє JSON, який не є об'єктом", () => {
    expect(parseErrors('[]')).toEqual([
      'Файл має бути JSON-об\'єктом з полями "sourceName" і "messages".',
    ]);
  });

  it('повідомляє про відсутні поля верхнього рівня', () => {
    expect(parseErrors('{}')).toEqual([
      'Поле "sourceName" має бути рядком з назвою джерела.',
      'Поле "messages" має бути масивом повідомлень.',
    ]);
  });

  it('відхиляє порожню назву джерела і порожній список повідомлень', () => {
    expect(parseErrors(toFileContent({ sourceName: '   ', messages: [] }))).toEqual([
      'Поле "sourceName" не може бути порожнім.',
      'Файл не містить жодного повідомлення.',
    ]);
  });

  it('вказує номер повідомлення з помилкою, рахуючи з одиниці', () => {
    const errors = parseErrors(
      toFileContent({
        sourceName: 'Демо-чат',
        messages: [validMessage, { ...validMessage, author: '' }, "не об'єкт"],
      }),
    );

    expect(errors).toEqual([
      'Повідомлення №2: поле "author" не може бути порожнім.',
      'Повідомлення №3: повідомлення має бути об\'єктом з полями "author", "at" і "text".',
    ]);
  });

  it.each([
    ['без часової зони', '2026-09-10T12:00:00'],
    ['лише дата', '2026-09-10'],
    ['не дата', 'вчора'],
  ])('відхиляє час %s', (_, at) => {
    const errors = parseErrors(
      toFileContent({ sourceName: 'Демо-чат', messages: [{ ...validMessage, at }] }),
    );

    expect(errors).toEqual([
      'Повідомлення №1: поле "at" має бути датою у форматі ISO 8601 з часовою зоною, наприклад 2026-09-10T12:00:00Z.',
    ]);
  });

  it('відхиляє текст лише з пробілів і текст неправильного типу', () => {
    const errors = parseErrors(
      toFileContent({
        sourceName: 'Демо-чат',
        messages: [
          { ...validMessage, text: ' \n ' },
          { ...validMessage, text: 42 },
        ],
      }),
    );

    expect(errors).toEqual([
      'Повідомлення №1: поле "text" не може бути порожнім.',
      'Повідомлення №2: поле "text" має бути рядком з текстом повідомлення.',
    ]);
  });

  it('показує обмежену кількість помилок і кількість прихованих', () => {
    const brokenMessageCount = MAX_REPORTED_ERRORS + 5;
    const errors = parseErrors(
      toFileContent({
        sourceName: 'Демо-чат',
        messages: Array.from({ length: brokenMessageCount }, () => ({ ...validMessage, text: '' })),
      }),
    );

    expect(errors).toHaveLength(MAX_REPORTED_ERRORS + 1);
    expect(errors.at(-1)).toBe('І ще помилок: 5.');
  });
});

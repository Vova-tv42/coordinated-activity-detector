import { describe, expect, it } from 'vitest';
import { detectTextSimilarity, extractCharacterNgrams } from './text-similarity';
import type { DetectorMessage } from './types';

describe('extractCharacterNgrams', () => {
  it('витягує всі 4-грами для тексту достатньої довжини', () => {
    const text = 'координація';
    const ngrams = extractCharacterNgrams(text);

    expect(Array.from(ngrams)).toEqual([
      'коор',
      'оорд',
      'орди',
      'рдин',
      'дина',
      'инац',
      'наці',
      'ація',
    ]);
  });

  it('повертає рівно одну 4-граму, якщо довжина дорівнює 4', () => {
    const text = 'тест';
    const ngrams = extractCharacterNgrams(text);

    expect(Array.from(ngrams)).toEqual(['тест']);
  });

  it('повертає порожню множину для тексту, коротшого за розмір n-грами', () => {
    const text = 'дія';
    const ngrams = extractCharacterNgrams(text);

    expect(ngrams.size).toBe(0);
  });
});

describe('detectTextSimilarity', () => {
  const profile = {
    minTextLength: 12,
    simThreshold: 0.6,
  };

  it('повертає максимальний скор 1 для однакових текстів повідомлень', () => {
    const messagesA: DetectorMessage[] = [
      { id: 1, sentAt: new Date(), text: 'Це скоординована атака на систему' },
    ];
    const messagesB: DetectorMessage[] = [
      { id: 2, sentAt: new Date(), text: 'Це скоординована атака на систему' },
    ];

    const result = detectTextSimilarity(messagesA, messagesB, profile);

    expect(result.signalKind).toBe('text');
    expect(result.value).toBe(1);
    expect(result.evidence).toHaveLength(1);
    expect(result.evidence[0].messageA.id).toBe(1);
    expect(result.evidence[0].messageB.id).toBe(2);
    expect(result.evidence[0].similarity).toBe(1);
  });

  it('виявляє перефразовані тексти з високим коефіцієнтом Жаккара', () => {
    const messagesA: DetectorMessage[] = [
      { id: 1, sentAt: new Date(), text: 'Терміново виходьте на центральну площу міста' },
    ];
    const messagesB: DetectorMessage[] = [
      { id: 2, sentAt: new Date(), text: 'Терміново виходьте на центральну площу нашого міста' },
    ];

    const result = detectTextSimilarity(messagesA, messagesB, profile);

    expect(result.value).toBeGreaterThanOrEqual(profile.simThreshold);
    expect(result.evidence).toHaveLength(1);
  });

  it('повертає 0 для абсолютно різних текстів', () => {
    const messagesA: DetectorMessage[] = [
      { id: 1, sentAt: new Date(), text: 'Сьогодні чудова сонячна погода у парку' },
    ];
    const messagesB: DetectorMessage[] = [
      { id: 2, sentAt: new Date(), text: 'Завтра відбудеться футбольний матч чемпіонату' },
    ];

    const result = detectTextSimilarity(messagesA, messagesB, profile);

    expect(result.value).toBe(0);
    expect(result.evidence).toHaveLength(0);
  });

  it('відсікає повідомлення, коротші за minTextLength', () => {
    const messagesA: DetectorMessage[] = [
      { id: 1, sentAt: new Date(), text: 'ок' },
      { id: 2, sentAt: new Date(), text: 'дякую' },
      { id: 3, sentAt: new Date(), text: '+1' },
    ];
    const messagesB: DetectorMessage[] = [
      { id: 4, sentAt: new Date(), text: 'ок' },
      { id: 5, sentAt: new Date(), text: 'дякую' },
    ];

    const result = detectTextSimilarity(messagesA, messagesB, profile);

    expect(result.value).toBe(0);
    expect(result.evidence).toHaveLength(0);
  });

  it('враховує лише повідомлення з довжиною, не меншою за minTextLength', () => {
    const messagesA: DetectorMessage[] = [
      { id: 1, sentAt: new Date(), text: 'ок' },
      { id: 2, sentAt: new Date(), text: 'Спільне координоване довге повідомлення' },
    ];
    const messagesB: DetectorMessage[] = [
      { id: 3, sentAt: new Date(), text: 'Спільне координоване довге повідомлення' },
      { id: 4, sentAt: new Date(), text: 'дякую' },
    ];

    const result = detectTextSimilarity(messagesA, messagesB, profile);

    expect(result.value).toBe(1);
    expect(result.evidence).toHaveLength(1);
    expect(result.evidence[0].messageA.id).toBe(2);
    expect(result.evidence[0].messageB.id).toBe(3);
  });

  it('коректно ділить на мінімальну кількість валідних повідомлень двох учасників', () => {
    const messagesA: DetectorMessage[] = [
      { id: 1, sentAt: new Date(), text: 'Перше довге спільне повідомлення для перевірки' },
      { id: 2, sentAt: new Date(), text: 'Друге повідомлення першого учасника про погоду' },
    ];
    const messagesB: DetectorMessage[] = [
      { id: 3, sentAt: new Date(), text: 'Перше довге спільне повідомлення для перевірки' },
      { id: 4, sentAt: new Date(), text: 'Інше довге повідомлення другого учасника' },
      { id: 5, sentAt: new Date(), text: 'Ще одне повідомлення другого учасника про новини' },
    ];

    const result = detectTextSimilarity(messagesA, messagesB, profile);

    expect(result.evidence).toHaveLength(1);
    // 1 збіг / min(2, 3) = 1 / 2 = 0.5
    expect(result.value).toBe(0.5);
  });

  it('повертає 0, якщо у будь-кого з учасників немає повідомлень', () => {
    const messagesA: DetectorMessage[] = [
      { id: 1, sentAt: new Date(), text: 'Довге повідомлення без пари' },
    ];

    const result = detectTextSimilarity(messagesA, [], profile);

    expect(result.value).toBe(0);
    expect(result.evidence).toHaveLength(0);
  });

  it('використовує параметри з профілю замість жорстко зашитих значень', () => {
    const customProfile = {
      minTextLength: 6,
      simThreshold: 0.9,
    };

    const messagesA: DetectorMessage[] = [{ id: 1, sentAt: new Date(), text: 'привіт усім' }];
    const messagesB: DetectorMessage[] = [{ id: 2, sentAt: new Date(), text: 'привіт усім' }];

    const result = detectTextSimilarity(messagesA, messagesB, customProfile);

    expect(result.value).toBe(1);
    expect(result.evidence).toHaveLength(1);
  });
});

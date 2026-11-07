import { describe, expect, it } from 'vitest';
import { detectCosharing, extractSharedItems, extractSharedItemsFromText } from './cosharing';
import type { DetectorMessage } from './types';

describe('extractSharedItemsFromText', () => {
  it('витягує домени URL зі зняттям www та переведенням у нижній регістр', () => {
    const text = 'Новини на https://www.BBC.COM/news та http://t.me/channel/123';
    const items = extractSharedItemsFromText(text);

    expect(items.has('bbc.com')).toBe(true);
    expect(items.has('t.me')).toBe(true);
  });

  it('витягує хештеги з переведенням у нижній регістр, включаючи кирилицю', () => {
    const text = 'Дивіться #Новини та #breaking_news_2026';
    const items = extractSharedItemsFromText(text);

    expect(items.has('#новини')).toBe(true);
    expect(items.has('#breaking_news_2026')).toBe(true);
  });

  it('не плутає URL-фрагменти (якорі) з хештегами', () => {
    const text = 'Посилання https://example.com/page#section';
    const items = extractSharedItemsFromText(text);

    expect(items.has('example.com')).toBe(true);
    expect(items.has('#section')).toBe(false);
  });
});

describe('extractSharedItems', () => {
  it('обʼєднує домени та хештеги з кількох повідомлень учасника', () => {
    const messages: DetectorMessage[] = [
      { id: 1, sentAt: new Date(), text: 'Перше посилання https://site1.com #новини' },
      { id: 2, sentAt: new Date(), text: 'Друге посилання https://site2.com #терміново' },
    ];

    const items = extractSharedItems(messages);

    expect(Array.from(items)).toEqual(
      expect.arrayContaining(['site1.com', 'site2.com', '#новини', '#терміново']),
    );
  });
});

describe('detectCosharing', () => {
  it('повертає 1, якщо обидва учасники поширюють однакові домени та хештеги', () => {
    const messagesA: DetectorMessage[] = [
      { id: 1, sentAt: new Date(), text: 'Ось посилання https://site.org і #акція' },
    ];
    const messagesB: DetectorMessage[] = [
      { id: 2, sentAt: new Date(), text: 'Читайте https://site.org/post та #акція' },
    ];

    const result = detectCosharing(messagesA, messagesB);

    expect(result.signalKind).toBe('cosharing');
    expect(result.value).toBe(1);
    expect(result.intersection).toEqual(expect.arrayContaining(['site.org', '#акція']));
  });

  it('коректно рахує частковий збіг за коефіцієнтом Жаккара', () => {
    const messagesA: DetectorMessage[] = [
      { id: 1, sentAt: new Date(), text: 'Посилання https://site1.com та https://site2.com' },
    ];
    const messagesB: DetectorMessage[] = [
      { id: 2, sentAt: new Date(), text: 'Посилання https://site2.com та https://site3.com' },
    ];

    const result = detectCosharing(messagesA, messagesB);

    // Спільний: site2.com (1). Усього: site1.com, site2.com, site3.com (3). Жаккар = 1 / 3
    expect(result.value).toBeCloseTo(1 / 3);
    expect(result.intersection).toEqual(['site2.com']);
  });

  it('повертає 0 для абсолютно різних посилань та хештегів', () => {
    const messagesA: DetectorMessage[] = [
      { id: 1, sentAt: new Date(), text: 'Дивіться https://first.org #first' },
    ];
    const messagesB: DetectorMessage[] = [
      { id: 2, sentAt: new Date(), text: 'Дивіться https://second.org #second' },
    ];

    const result = detectCosharing(messagesA, messagesB);

    expect(result.value).toBe(0);
    expect(result.intersection).toHaveLength(0);
  });

  it('повертає 0, якщо в учасників немає жодного посилання або хештегу', () => {
    const messagesA: DetectorMessage[] = [
      { id: 1, sentAt: new Date(), text: 'Звичайний текст без посилань' },
    ];
    const messagesB: DetectorMessage[] = [
      { id: 2, sentAt: new Date(), text: 'Ще один простий текст' },
    ];

    const result = detectCosharing(messagesA, messagesB);

    expect(result.value).toBe(0);
    expect(result.sharedItemsA).toHaveLength(0);
    expect(result.sharedItemsB).toHaveLength(0);
  });
});

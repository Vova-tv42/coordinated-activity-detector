import { describe, expect, it } from 'vitest';
import { normalizeText } from '@/lib/normalize-text';

describe('normalizeText', () => {
  it('приводить текст до нижнього регістру', () => {
    expect(normalizeText('ПРИВІТ СВІТ Hello WORLD')).toBe('привіт світ hello world');
  });

  it('видаляє посилання з протоколом http та https', () => {
    const textWithLinks = 'Ось сайт https://example.com/test?query=1 та http://info.org у тексті';
    expect(normalizeText(textWithLinks)).toBe('ось сайт та у тексті');
  });

  it('видаляє посилання без протоколу', () => {
    const textWithShortLinks = 'Підписуйтесь t.me/channel та bit.ly/promo на ресурсі google.com';
    expect(normalizeText(textWithShortLinks)).toBe('підписуйтесь та на ресурсі');
  });

  it('не склеює слова навколо видаленого посилання', () => {
    expect(normalizeText('слово1 https://example.com слово2')).toBe('слово1 слово2');
    expect(normalizeText('слово1,https://example.com,слово2')).toBe('слово1 слово2');
  });

  it('видаляє всі види апострофів, зберігаючи слово цілісним', () => {
    expect(normalizeText("м'яч")).toBe('мяч');
    expect(normalizeText('м’яч')).toBe('мяч');
    expect(normalizeText('мʼяч')).toBe('мяч');
    expect(normalizeText('м`яч')).toBe('мяч');
    expect(normalizeText("пам'ять об'єм з'їзд зв'язок")).toBe('память обєм зїзд звязок');
  });

  it('видаляє розділові знаки та спецсимволи', () => {
    const textWithPunctuation = 'Привіт! Як справи? (Все добре), #тег: [100$] / 50% *перевірка*...';
    expect(normalizeText(textWithPunctuation)).toBe(
      'привіт як справи все добре тег 100 50 перевірка',
    );
  });

  it('видаляє емодзі', () => {
    const textWithEmoji = 'Доброго ранку ☀️🇺🇦! Гарного дня 👍🔥';
    expect(normalizeText(textWithEmoji)).toBe('доброго ранку гарного дня');
  });

  it('зберігає цифри разом зі словами', () => {
    expect(normalizeText('Подія 2026 року відбудеться о 15 годині')).toBe(
      'подія 2026 року відбудеться о 15 годині',
    );
  });

  it('стискає повторювані пробіли, табуляції та переноси рядків', () => {
    const whitespaceText = '  перше   слово \t\t друге\n\nтретє  \r\n  четверте  ';
    expect(normalizeText(whitespaceText)).toBe('перше слово друге третє четверте');
  });

  it('нормалізує складені символи через NFKC', () => {
    const combiningText = 'й\u0306';
    expect(normalizeText(combiningText)).toBe('й');
  });

  it('повертає порожній рядок для порожнього тексту або тексту лише з розділових знаків', () => {
    expect(normalizeText('')).toBe('');
    expect(normalizeText('   \n\t  ')).toBe('');
    expect(normalizeText('!@#$%^&*()_+=-.,<>/?;:~`')).toBe('');
    expect(normalizeText('https://example.com')).toBe('');
    expect(normalizeText('😀🔥🎉')).toBe('');
  });
});

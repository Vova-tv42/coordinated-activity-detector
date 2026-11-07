import { describe, expect, it } from 'vitest';
import { detectCoactivity } from './coactivity';
import type { DetectorMessage } from './types';

describe('detectCoactivity', () => {
  const profile = {
    syncGapSec: 60,
  };

  const BASE_TIME = 1_700_000_040_000; // 1_700_000_040_000 % 60_000 === 0

  it('повертає скор 1 для повідомлень, надісланих у межах одного часового бакета', () => {
    const messagesA: DetectorMessage[] = [
      { id: 1, sentAt: new Date(BASE_TIME + 5_000), text: 'Повідомлення A' },
    ];
    const messagesB: DetectorMessage[] = [
      { id: 2, sentAt: new Date(BASE_TIME + 15_000), text: 'Повідомлення B' },
    ];

    const result = detectCoactivity(messagesA, messagesB, profile);

    expect(result.signalKind).toBe('coactivity');
    expect(result.value).toBe(1);
  });

  it('усуває крайовий ефект завдяки сітці зі зсувом на Δ/2', () => {
    // 60 секунд = 60_000 мс. Повідомлення на стику: 59_000 мс і 61_000 мс (різниця 2 секунди)
    // У сітці з нульовим зсувом: бакети 0 і 1 (збігу немає).
    // У сітці зі зсувом 30_000 мс: (59000-30000)/60000 = 0 і (61000-30000)/60000 = 0 (той самий бакет).
    const messagesA: DetectorMessage[] = [
      { id: 1, sentAt: new Date(BASE_TIME + 59_000), text: 'Повідомлення A' },
    ];
    const messagesB: DetectorMessage[] = [
      { id: 2, sentAt: new Date(BASE_TIME + 61_000), text: 'Повідомлення B' },
    ];

    const result = detectCoactivity(messagesA, messagesB, profile);

    expect(result.gridZeroJaccard).toBe(0);
    expect(result.gridShiftedJaccard).toBe(1);
    expect(result.value).toBe(1);
  });

  it('повертає 0 для повідомлень, рознесених на великі проміжки часу в обох сітках', () => {
    const messagesA: DetectorMessage[] = [
      { id: 1, sentAt: new Date(BASE_TIME), text: 'Повідомлення A' },
    ];
    const messagesB: DetectorMessage[] = [
      { id: 2, sentAt: new Date(BASE_TIME + 3_600_000), text: 'Повідомлення B через годину' },
    ];

    const result = detectCoactivity(messagesA, messagesB, profile);

    expect(result.value).toBe(0);
  });

  it('нормалізує балакучих учасників за допомогою коефіцієнта Жаккара над множинами бакетів', () => {
    // Учасник A активний лише в одному бакеті (спільному з B)
    const messagesA: DetectorMessage[] = [
      { id: 1, sentAt: new Date(BASE_TIME + 5_000), text: 'A1' },
    ];
    // Учасник B активний постійно у 4 різних бакетах
    const messagesB: DetectorMessage[] = [
      { id: 2, sentAt: new Date(BASE_TIME + 5_000), text: 'B1' },
      { id: 3, sentAt: new Date(BASE_TIME + 70_000), text: 'B2' },
      { id: 4, sentAt: new Date(BASE_TIME + 130_000), text: 'B3' },
      { id: 5, sentAt: new Date(BASE_TIME + 190_000), text: 'B4' },
    ];

    const result = detectCoactivity(messagesA, messagesB, profile);

    // Спільний бакет: 1. Усього унікальних бакетів у об'єднанні: 4. Жаккар = 1 / 4 = 0.25
    expect(result.value).toBe(0.25);
  });

  it('повертає 0 для порожнього списку повідомлень будь-якого учасника', () => {
    const messagesA: DetectorMessage[] = [
      { id: 1, sentAt: new Date(BASE_TIME), text: 'Повідомлення A' },
    ];

    const result = detectCoactivity(messagesA, [], profile);

    expect(result.value).toBe(0);
  });

  it('повертає 0 при невалідному значенні syncGapSec', () => {
    const messagesA: DetectorMessage[] = [
      { id: 1, sentAt: new Date(BASE_TIME), text: 'Повідомлення A' },
    ];
    const messagesB: DetectorMessage[] = [
      { id: 2, sentAt: new Date(BASE_TIME), text: 'Повідомлення B' },
    ];

    const result = detectCoactivity(messagesA, messagesB, { syncGapSec: 0 });

    expect(result.value).toBe(0);
  });
});

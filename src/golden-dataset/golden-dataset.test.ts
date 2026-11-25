import { describe, expect, it } from 'vitest';
import { loadGoldenDataset } from './golden-dataset';

const goldenDataset = loadGoldenDataset();

describe('Golden Dataset', () => {
  it('містить від 8 до 10 логів', () => {
    expect(goldenDataset.length).toBeGreaterThanOrEqual(8);
    expect(goldenDataset.length).toBeLessThanOrEqual(10);
  });

  it('має логи і з координацією, і без неї', () => {
    const logsWithCoordination = goldenDataset.filter((entry) => entry.groundTruth.length > 0);
    const logsWithoutCoordination = goldenDataset.filter((entry) => entry.groundTruth.length === 0);

    expect(logsWithCoordination.length).toBeGreaterThan(0);
    expect(logsWithoutCoordination.length).toBeGreaterThan(0);
  });

  it.each(goldenDataset)('$fileName: учасники з Ground Truth пишуть у лозі', (entry) => {
    const authors = new Set(entry.chatLog.messages.map((message) => message.author));
    const coordinatedAuthors = entry.groundTruth.flat();

    for (const author of coordinatedAuthors) {
      expect(authors).toContain(author);
    }
  });

  it.each(goldenDataset)('$fileName: учасник належить щонайбільше одній групі', (entry) => {
    const coordinatedAuthors = entry.groundTruth.flat();

    expect(new Set(coordinatedAuthors).size).toBe(coordinatedAuthors.length);
  });
});

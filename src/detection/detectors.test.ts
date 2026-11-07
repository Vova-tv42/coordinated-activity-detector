import { describe, expect, it } from 'vitest';
import { detectPairSignals } from './detectors';
import type { DetectionProfileConfig, DetectorMessage } from './types';

describe('detectPairSignals', () => {
  const profile: DetectionProfileConfig = {
    syncGapSec: 60,
    minTextLength: 12,
    simThreshold: 0.6,
  };

  const BASE_TIME = 1_700_000_000_000;

  it('викликає всі три детектори та повертає агреговані результати', () => {
    const messagesA: DetectorMessage[] = [
      {
        id: 1,
        sentAt: new Date(BASE_TIME),
        text: 'Термінова скоординована кампанія https://truth.ua #новини',
      },
    ];
    const messagesB: DetectorMessage[] = [
      {
        id: 2,
        sentAt: new Date(BASE_TIME + 10_000),
        text: 'Термінова скоординована кампанія https://truth.ua #новини',
      },
    ];

    const result = detectPairSignals(messagesA, messagesB, profile);

    expect(result.text.signalKind).toBe('text');
    expect(result.text.value).toBe(1);
    expect(result.text.evidence).toHaveLength(1);

    expect(result.coactivity.signalKind).toBe('coactivity');
    expect(result.coactivity.value).toBe(1);

    expect(result.cosharing.signalKind).toBe('cosharing');
    expect(result.cosharing.value).toBe(1);
  });
});

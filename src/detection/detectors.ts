import { detectCoactivity } from './coactivity';
import { detectCosharing } from './cosharing';
import { detectTextSimilarity } from './text-similarity';
import type { DetectionProfileConfig, DetectorMessage, PairSignalsResult } from './types';

export * from './coactivity';
export * from './cosharing';
export * from './jaccard';
export * from './text-similarity';
export * from './types';

export function detectPairSignals<TMessage extends DetectorMessage>(
  messagesA: TMessage[],
  messagesB: TMessage[],
  profile: DetectionProfileConfig,
): PairSignalsResult<TMessage> {
  const text = detectTextSimilarity(messagesA, messagesB, {
    minTextLength: profile.minTextLength,
    simThreshold: profile.simThreshold,
  });

  const coactivity = detectCoactivity(messagesA, messagesB, {
    syncGapSec: profile.syncGapSec,
  });

  const cosharing = detectCosharing(messagesA, messagesB);

  return {
    text,
    coactivity,
    cosharing,
  };
}

import { calculateJaccardSimilarity } from './jaccard';
import type { CoactivityResult, DetectionProfileConfig, DetectorMessage } from './types';

const MILLISECONDS_PER_SECOND = 1000;
const GRID_OFFSET_DIVISOR = 2;
const MIN_SIGNAL_VALUE = 0;
const EMPTY_COUNT = 0;

function extractTimestampMs(message: DetectorMessage): number {
  if (message.sentAt instanceof Date) {
    return message.sentAt.getTime();
  }
  return Number(message.sentAt);
}

export type CoactivityProfile = Pick<DetectionProfileConfig, 'syncGapSec'>;

export function detectCoactivity<TMessage extends DetectorMessage>(
  messagesA: TMessage[],
  messagesB: TMessage[],
  profile: CoactivityProfile,
): CoactivityResult {
  const hasNoMessages = messagesA.length === EMPTY_COUNT || messagesB.length === EMPTY_COUNT;
  if (hasNoMessages) {
    return {
      signalKind: 'coactivity',
      value: MIN_SIGNAL_VALUE,
      gridZeroJaccard: MIN_SIGNAL_VALUE,
      gridShiftedJaccard: MIN_SIGNAL_VALUE,
    };
  }

  const bucketWidthMs = profile.syncGapSec * MILLISECONDS_PER_SECOND;
  const isInvalidBucketWidth = bucketWidthMs <= MIN_SIGNAL_VALUE;
  if (isInvalidBucketWidth) {
    return {
      signalKind: 'coactivity',
      value: MIN_SIGNAL_VALUE,
      gridZeroJaccard: MIN_SIGNAL_VALUE,
      gridShiftedJaccard: MIN_SIGNAL_VALUE,
    };
  }

  const halfBucketWidthMs = Math.floor(bucketWidthMs / GRID_OFFSET_DIVISOR);

  const bucketsA0 = new Set<number>();
  const bucketsA1 = new Set<number>();
  for (const message of messagesA) {
    const timestampMs = extractTimestampMs(message);
    bucketsA0.add(Math.floor(timestampMs / bucketWidthMs));
    bucketsA1.add(Math.floor((timestampMs - halfBucketWidthMs) / bucketWidthMs));
  }

  const bucketsB0 = new Set<number>();
  const bucketsB1 = new Set<number>();
  for (const message of messagesB) {
    const timestampMs = extractTimestampMs(message);
    bucketsB0.add(Math.floor(timestampMs / bucketWidthMs));
    bucketsB1.add(Math.floor((timestampMs - halfBucketWidthMs) / bucketWidthMs));
  }

  const gridZeroJaccard = calculateJaccardSimilarity(bucketsA0, bucketsB0);
  const gridShiftedJaccard = calculateJaccardSimilarity(bucketsA1, bucketsB1);
  const value = Math.max(gridZeroJaccard, gridShiftedJaccard);

  return {
    signalKind: 'coactivity',
    value,
    gridZeroJaccard,
    gridShiftedJaccard,
  };
}

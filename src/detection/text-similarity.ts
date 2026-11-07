import { normalizeText } from '@/lib/normalize-text';
import { calculateJaccardSimilarity } from './jaccard';
import type {
  DetectionProfileConfig,
  DetectorMessage,
  TextEvidence,
  TextSimilarityResult,
} from './types';

const DEFAULT_NGRAM_SIZE = 4;
const EMPTY_COUNT = 0;
const INDEX_OFFSET = 1;
const START_INDEX = 0;
const MIN_SIGNAL_VALUE = 0;
const MAX_SIGNAL_VALUE = 1;

export function extractCharacterNgrams(text: string, ngramSize = DEFAULT_NGRAM_SIZE): Set<string> {
  const ngrams = new Set<string>();
  const isTextTooShort = text.length < ngramSize;
  if (isTextTooShort) {
    return ngrams;
  }

  const maxStartIndex = text.length - ngramSize;
  for (let index = START_INDEX; index <= maxStartIndex; index += INDEX_OFFSET) {
    ngrams.add(text.slice(index, index + ngramSize));
  }

  return ngrams;
}

export type TextSimilarityProfile = Pick<DetectionProfileConfig, 'minTextLength' | 'simThreshold'>;

export function detectTextSimilarity<TMessage extends DetectorMessage>(
  messagesA: TMessage[],
  messagesB: TMessage[],
  profile: TextSimilarityProfile,
): TextSimilarityResult<TMessage> {
  const eligibleMessagesA = messagesA.filter((message) => {
    const text = message.normalizedText ?? normalizeText(message.text);
    return text.length >= profile.minTextLength;
  });

  const eligibleMessagesB = messagesB.filter((message) => {
    const text = message.normalizedText ?? normalizeText(message.text);
    return text.length >= profile.minTextLength;
  });

  const hasNoEligibleMessages =
    eligibleMessagesA.length === EMPTY_COUNT || eligibleMessagesB.length === EMPTY_COUNT;
  if (hasNoEligibleMessages) {
    return {
      signalKind: 'text',
      value: MIN_SIGNAL_VALUE,
      evidence: [],
    };
  }

  const preparedMessagesA = eligibleMessagesA.map((message) => {
    const text = message.normalizedText ?? normalizeText(message.text);
    return {
      message,
      ngrams: extractCharacterNgrams(text),
    };
  });

  const preparedMessagesB = eligibleMessagesB.map((message) => {
    const text = message.normalizedText ?? normalizeText(message.text);
    return {
      message,
      ngrams: extractCharacterNgrams(text),
    };
  });

  const matchingPairs: TextEvidence<TMessage>[] = [];

  for (const itemA of preparedMessagesA) {
    for (const itemB of preparedMessagesB) {
      const similarity = calculateJaccardSimilarity(itemA.ngrams, itemB.ngrams);
      const isSimilarEnough = similarity >= profile.simThreshold;
      if (isSimilarEnough) {
        matchingPairs.push({
          messageA: itemA.message,
          messageB: itemB.message,
          similarity,
        });
      }
    }
  }

  const minEligibleCount = Math.min(eligibleMessagesA.length, eligibleMessagesB.length);
  const rawRatio = matchingPairs.length / minEligibleCount;
  const signalValue = Math.min(MAX_SIGNAL_VALUE, rawRatio);

  return {
    signalKind: 'text',
    value: signalValue,
    evidence: matchingPairs,
  };
}

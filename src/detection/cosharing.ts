import { LinkifyIt } from 'linkify-it';
import { removeLinks } from '@/lib/normalize-text';
import { calculateJaccardSimilarity } from './jaccard';
import type { CosharingResult, DetectorMessage } from './types';

const linkify = new LinkifyIt({ fuzzyLink: true });

const EMPTY_LENGTH = 0;
const HASHTAG_CAPTURE_INDEX = 1;
const HASHTAG_REGEX = /#([\p{L}\p{N}_]+)/gu;
const WWW_PREFIX_REGEX = /^www\./i;

export function extractSharedItemsFromText(text: string): Set<string> {
  const items = new Set<string>();

  const detectedLinks = linkify.match(text) ?? [];
  for (const link of detectedLinks) {
    try {
      const parsedUrl = new URL(link.url);
      const normalizedHostname = parsedUrl.hostname.toLowerCase().replace(WWW_PREFIX_REGEX, '');
      const hasHostname = normalizedHostname.length > EMPTY_LENGTH;
      if (hasHostname) {
        items.add(normalizedHostname);
      }
    } catch {
      // Ignore malformed URLs that cannot be parsed
    }
  }

  const textWithoutLinks = removeLinks(text);
  for (const match of textWithoutLinks.matchAll(HASHTAG_REGEX)) {
    const hashtag = `#${match[HASHTAG_CAPTURE_INDEX].toLowerCase()}`;
    items.add(hashtag);
  }

  return items;
}

export function extractSharedItems<TMessage extends DetectorMessage>(
  messages: TMessage[],
): Set<string> {
  const combinedItems = new Set<string>();

  for (const message of messages) {
    const messageItems = extractSharedItemsFromText(message.text);
    for (const item of messageItems) {
      combinedItems.add(item);
    }
  }

  return combinedItems;
}

export function detectCosharing<TMessage extends DetectorMessage>(
  messagesA: TMessage[],
  messagesB: TMessage[],
): CosharingResult {
  const itemsA = extractSharedItems(messagesA);
  const itemsB = extractSharedItems(messagesB);

  const value = calculateJaccardSimilarity(itemsA, itemsB);

  const intersection: string[] = [];
  for (const item of itemsA) {
    if (itemsB.has(item)) {
      intersection.push(item);
    }
  }

  return {
    signalKind: 'cosharing',
    value,
    sharedItemsA: Array.from(itemsA),
    sharedItemsB: Array.from(itemsB),
    intersection,
  };
}

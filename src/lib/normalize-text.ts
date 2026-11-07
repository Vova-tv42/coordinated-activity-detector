import { LinkifyIt } from 'linkify-it';

// Links are often posted without a protocol (t.me/..., bit.ly/...), fuzzy matching is off by default
const linkify = new LinkifyIt({ fuzzyLink: true });

// Ukrainian words are written with different apostrophes, removing them keeps such words whole
const APOSTROPHES = /['`’ʼ]/g;
const NON_WORD_CHARACTERS = /[^\p{L}\p{N}\s]+/gu;
const WHITESPACE = /\s+/g;

export function removeLinks(text: string) {
  const links = linkify.match(text) ?? [];

  return links.reduceRight(
    (result, link) => `${result.slice(0, link.index)} ${result.slice(link.lastIndex)}`,
    text,
  );
}

export function normalizeText(text: string): string {
  // NFKC joins letters typed with combining marks, otherwise the marks are stripped as symbols
  const lowercaseText = text.normalize('NFKC').toLowerCase();

  return removeLinks(lowercaseText)
    .replace(APOSTROPHES, '')
    .replace(NON_WORD_CHARACTERS, ' ')
    .replace(WHITESPACE, ' ')
    .trim();
}

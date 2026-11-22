import fc from 'fast-check';

export const CHAT_START = new Date('2026-01-15T12:00:00.000Z');
export const CHAT_DURATION_MS = 30 * 60_000;
export const CHAT_END = new Date(CHAT_START.getTime() + CHAT_DURATION_MS);

const MIN_PARTICIPANTS = 2;
const MAX_PARTICIPANTS = 8;
const MIN_ORIGINAL_MESSAGES = 1;
const MAX_ORIGINAL_MESSAGES = 40;
const MAX_REDELIVERIES = 10;
const LARGEST_PROFILE_INTEGER = 100_000;
const OUT_OF_RANGE_DOUBLE_LIMIT = 1e6;
const SMALLEST_DOUBLE_ABOVE_ONE = 1.000001;
const LARGEST_DOUBLE_BELOW_ZERO = -1e-9;
const BURST_START_MS = 10 * 60_000;
const BURST_LENGTH_MS = 90_000;

// A small vocabulary makes identical and near-identical messages frequent
const PHRASES = [
  'Підтримуємо ініціативу, діліться новиною з друзями',
  'Підтримуємо ініціативу, діліться новиною із друзями!',
  'Усі на мітинг сьогодні ввечері, не пропустіть',
  'Це правда, перевірено на власному досвіді',
  'Не вірте їм, вони постійно брешуть людям',
  'Дякую за інформацію, дуже корисно знати',
  'Хто сьогодні йде на зустріч у центрі міста?',
  'Короткий текст',
];

const LINKS = ['https://example.com/news/1', 't.me/some_channel', 'https://example.org/post?id=7'];
const HASHTAGS = ['#новини', '#підтримка', '#мітинг'];

export type ChatDelivery = {
  participantIndex: number;
  tgMessageId: number;
  offsetMs: number;
  text: string;
};

export type GeneratedChat = {
  participantCount: number;
  deliveries: ChatDelivery[];
};

export function participantExternalId(participantIndex: number) {
  return `user-${participantIndex}`;
}

export function participantDisplayName(participantIndex: number) {
  return `Учасник ${participantIndex}`;
}

export function countUniqueMessages(chat: GeneratedChat) {
  return new Set(chat.deliveries.map((delivery) => delivery.tgMessageId)).size;
}

const messageTextArbitrary = fc
  .record({
    phrase: fc.constantFrom(...PHRASES),
    link: fc.option(fc.constantFrom(...LINKS), { nil: undefined }),
    hashtag: fc.option(fc.constantFrom(...HASHTAGS), { nil: undefined }),
  })
  .map(({ phrase, link, hashtag }) => [phrase, link, hashtag].filter(Boolean).join(' '));

const uniformOffsetArbitrary = fc.integer({ min: 0, max: CHAT_DURATION_MS });
const burstOffsetArbitrary = fc.integer({
  min: BURST_START_MS,
  max: BURST_START_MS + BURST_LENGTH_MS,
});
const offsetArbitrary = fc.oneof(uniformOffsetArbitrary, burstOffsetArbitrary);

function chatWithParticipantCount(participantCount: number): fc.Arbitrary<GeneratedChat> {
  const originalDeliveriesArbitrary = fc
    .array(
      fc.record({
        participantIndex: fc.integer({ min: 0, max: participantCount - 1 }),
        offsetMs: offsetArbitrary,
        text: messageTextArbitrary,
      }),
      { minLength: MIN_ORIGINAL_MESSAGES, maxLength: MAX_ORIGINAL_MESSAGES },
    )
    .map((messages) =>
      messages.map((message, position) => ({ ...message, tgMessageId: position + 1 })),
    );

  const redeliveredPositionsArbitrary = fc.array(fc.nat(), { maxLength: MAX_REDELIVERIES });

  return fc
    .tuple(originalDeliveriesArbitrary, redeliveredPositionsArbitrary)
    .map(([originalDeliveries, redeliveredPositions]) => ({
      participantCount,
      deliveries: [
        ...originalDeliveries,
        ...redeliveredPositions.map(
          (position) => originalDeliveries[position % originalDeliveries.length],
        ),
      ],
    }));
}

export const chatArbitrary: fc.Arbitrary<GeneratedChat> = fc
  .integer({ min: MIN_PARTICIPANTS, max: MAX_PARTICIPANTS })
  .chain(chatWithParticipantCount);

export const twoChatsArbitrary = fc.tuple(chatArbitrary, chatArbitrary);

export type ProfileValues = {
  syncGapSec: number;
  windowMinutes: number;
  windowMaxMessages: number;
  minTextLength: number;
  simThreshold: number;
  wText: number;
  wCoactivity: number;
  wCosharing: number;
  edgeThreshold: number;
  keepThreshold: number;
};

const validIntegerArbitrary = (minimum: number) =>
  fc.integer({ min: minimum, max: LARGEST_PROFILE_INTEGER });
const unitIntervalArbitrary = fc.double({ min: 0, max: 1, noNaN: true });

export const validProfileValuesArbitrary: fc.Arbitrary<ProfileValues> = fc.record({
  syncGapSec: validIntegerArbitrary(1),
  windowMinutes: validIntegerArbitrary(1),
  windowMaxMessages: validIntegerArbitrary(1),
  minTextLength: validIntegerArbitrary(0),
  simThreshold: unitIntervalArbitrary,
  wText: unitIntervalArbitrary,
  wCoactivity: unitIntervalArbitrary,
  wCosharing: unitIntervalArbitrary,
  edgeThreshold: unitIntervalArbitrary,
  keepThreshold: unitIntervalArbitrary,
});

const outOfRangeIntegerArbitrary = (maximumInvalid: number) =>
  fc.integer({ min: -LARGEST_PROFILE_INTEGER, max: maximumInvalid });

const outOfUnitIntervalArbitrary = fc.oneof(
  fc.double({
    min: SMALLEST_DOUBLE_ABOVE_ONE,
    max: OUT_OF_RANGE_DOUBLE_LIMIT,
    noNaN: true,
  }),
  fc.double({
    min: -OUT_OF_RANGE_DOUBLE_LIMIT,
    max: LARGEST_DOUBLE_BELOW_ZERO,
    noNaN: true,
  }),
);

const invalidValueByColumn: Record<keyof ProfileValues, fc.Arbitrary<number>> = {
  syncGapSec: outOfRangeIntegerArbitrary(0),
  windowMinutes: outOfRangeIntegerArbitrary(0),
  windowMaxMessages: outOfRangeIntegerArbitrary(0),
  minTextLength: outOfRangeIntegerArbitrary(-1),
  simThreshold: outOfUnitIntervalArbitrary,
  wText: outOfUnitIntervalArbitrary,
  wCoactivity: outOfUnitIntervalArbitrary,
  wCosharing: outOfUnitIntervalArbitrary,
  edgeThreshold: outOfUnitIntervalArbitrary,
  keepThreshold: outOfUnitIntervalArbitrary,
};

const profileColumns = Object.keys(invalidValueByColumn) as (keyof ProfileValues)[];

export const invalidProfileValuesArbitrary = fc
  .tuple(validProfileValuesArbitrary, fc.constantFrom(...profileColumns))
  .chain(([validValues, brokenColumn]) =>
    invalidValueByColumn[brokenColumn].map((invalidValue) => ({
      ...validValues,
      [brokenColumn]: invalidValue,
    })),
  );

import { describe, expect, it } from 'vitest';
import { detectCoactivity } from './coactivity';
import { detectCosharing } from './cosharing';
import { analyzeCoordinationFromMessages, calculatePairScore } from './graph';
import {
  at,
  copyPasteFarm,
  DEFAULT_PROFILE,
  type FixtureMessage,
  linkSharingFarm,
  lonelySpammer,
  messagesOf,
  paraphraseFarm,
  SCENARIOS,
  timeSpreadFarm,
  twoFriendsChatting,
} from './test-fixtures';
import { detectTextSimilarity } from './text-similarity';
import type { ParticipantId } from './types';

function sortedGroups(groups: { participantIds: ParticipantId[] }[]) {
  return groups.map((group) => group.participantIds.map(String).sort()).sort();
}

function pairSignals(messagesA: FixtureMessage[], messagesB: FixtureMessage[]) {
  return {
    text: detectTextSimilarity(messagesA, messagesB, DEFAULT_PROFILE),
    coactivity: detectCoactivity(messagesA, messagesB, DEFAULT_PROFILE),
    cosharing: detectCosharing(messagesA, messagesB),
  };
}

describe('сигнали детекторів на сценаріях чату', () => {
  it('копіпаст-ферма: усі три сигнали тексту і часу максимальні, посилань немає', () => {
    const signals = pairSignals(
      messagesOf(copyPasteFarm, 'bot1'),
      messagesOf(copyPasteFarm, 'bot3'),
    );

    expect(signals.text.value).toBe(1);
    expect(signals.text.evidence).toHaveLength(3);
    expect(signals.coactivity.value).toBe(1);
    expect(signals.cosharing.value).toBe(0);
  });

  it('ферма з перефразуванням: текст схожий попри різні слова', () => {
    const signals = pairSignals(
      messagesOf(paraphraseFarm, 'bot1'),
      messagesOf(paraphraseFarm, 'bot4'),
    );

    expect(signals.text.value).toBe(1);
    expect(signals.text.evidence[0].similarity).toBeGreaterThanOrEqual(
      DEFAULT_PROFILE.simThreshold,
    );
    expect(signals.text.evidence[0].similarity).toBeLessThan(1);
  });

  it('ферма з рознесенням у часі: текст однаковий, але спільної активності немає', () => {
    const signals = pairSignals(
      messagesOf(timeSpreadFarm, 'bot1'),
      messagesOf(timeSpreadFarm, 'bot2'),
    );

    expect(signals.text.value).toBe(1);
    expect(signals.coactivity.value).toBe(0);
  });

  it('спільне поширення посилань: однаковий домен і хештег за різних текстів', () => {
    const signals = pairSignals(
      messagesOf(linkSharingFarm, 'promo1'),
      messagesOf(linkSharingFarm, 'promo3'),
    );

    expect(signals.text.value).toBe(0);
    expect(signals.cosharing.value).toBe(1);
    expect(signals.cosharing.intersection.sort()).toEqual(['#вибори2026', 'pravda-news.com.ua']);
  });

  it('двоє друзів: пишуть синхронно, але різними словами і без посилань', () => {
    const signals = pairSignals(
      messagesOf(twoFriendsChatting, 'olena'),
      messagesOf(twoFriendsChatting, 'taras'),
    );

    expect(signals.text.value).toBe(0);
    expect(signals.coactivity.value).toBeGreaterThan(0.5);
    expect(calculatePairScore(signals, DEFAULT_PROFILE)).toBeLessThan(
      DEFAULT_PROFILE.edgeThreshold,
    );
  });

  it('один спамер: повтори власного тексту не роблять його схожим на інших', () => {
    const signals = pairSignals(
      messagesOf(lonelySpammer, 'spammer'),
      messagesOf(lonelySpammer, 'bob'),
    );

    expect(signals.text.value).toBe(0);
    expect(calculatePairScore(signals, DEFAULT_PROFILE)).toBeLessThan(
      DEFAULT_PROFILE.edgeThreshold,
    );
  });
});

describe('повний аналіз сценаріїв з дефолтним профілем', () => {
  it.each(Object.entries(SCENARIOS))('%s', (_scenarioName, scenario) => {
    const result = analyzeCoordinationFromMessages(scenario.messages, DEFAULT_PROFILE);

    expect(sortedGroups(result.groups)).toEqual(
      scenario.expectedGroups.map((group) => [...group].sort()),
    );
  });

  it('звичайний учасник поруч з фермою не потрапляє в групу', () => {
    const result = analyzeCoordinationFromMessages(copyPasteFarm.messages, DEFAULT_PROFILE);

    const flaggedParticipants = result.groups.flatMap((group) => group.participantIds);
    expect(flaggedParticipants).not.toContain('alice');
  });

  it('скор групи копіпаст-ферми дорівнює зваженій сумі тексту і спільної активності', () => {
    const result = analyzeCoordinationFromMessages(copyPasteFarm.messages, DEFAULT_PROFILE);

    // Text and coactivity are 1, there are no links: 0.5 * 1 + 0.3 * 1 + 0.2 * 0
    expect(result.groups[0].score).toBeCloseTo(0.8);
  });
});

describe('межові випадки', () => {
  it('повідомлення о 12:00:59 і 12:01:01 вважаються синхронними завдяки зсунутій сітці', () => {
    const coactivity = detectCoactivity(
      [{ sentAt: at(0, 59), text: 'перше' }],
      [{ sentAt: at(1, 1), text: 'друге' }],
      DEFAULT_PROFILE,
    );

    expect(coactivity.gridZeroJaccard).toBe(0);
    expect(coactivity.gridShiftedJaccard).toBe(1);
    expect(coactivity.value).toBe(1);
  });

  it('зсунута сітка працює і для непарного Δ', () => {
    // Buckets count from the Unix epoch: with Δ = 7 s the shifted grid starts at 3.5 s,
    // so 6 s and 8 s fall into different plain buckets but share the shifted one [3.5, 10.5)
    const bucketStart = 7000 * 250_000_000;
    const coactivity = detectCoactivity(
      [{ sentAt: bucketStart + 6000, text: 'перше' }],
      [{ sentAt: bucketStart + 8000, text: 'друге' }],
      { syncGapSec: 7 },
    );

    expect(coactivity.gridZeroJaccard).toBe(0);
    expect(coactivity.value).toBe(1);
  });

  it('повідомлення, рознесені більш ніж на Δ, не синхронні в жодній сітці', () => {
    const coactivity = detectCoactivity(
      [{ sentAt: at(0, 0), text: 'перше' }],
      [{ sentAt: at(2, 30), text: 'друге' }],
      DEFAULT_PROFILE,
    );

    expect(coactivity.value).toBe(0);
  });

  it('текст рівно minTextLength символів враховується, на символ коротший відкидається', () => {
    const exactLengthText = 'абвгдежзийкл';
    const shorterText = exactLengthText.slice(1);
    expect(exactLengthText).toHaveLength(DEFAULT_PROFILE.minTextLength);

    const countedSignal = detectTextSimilarity(
      [{ sentAt: at(0), text: exactLengthText }],
      [{ sentAt: at(0), text: exactLengthText }],
      DEFAULT_PROFILE,
    );
    const droppedSignal = detectTextSimilarity(
      [{ sentAt: at(0), text: shorterText }],
      [{ sentAt: at(0), text: shorterText }],
      DEFAULT_PROFILE,
    );

    expect(countedSignal.value).toBe(1);
    expect(droppedSignal.value).toBe(0);
  });

  it('однакові повідомлення з коротких слів визначаються як схожі', () => {
    const signal = detectTextSimilarity(
      [{ sentAt: at(0), text: 'де ти є тут там' }],
      [{ sentAt: at(0), text: 'де ти є тут там' }],
      DEFAULT_PROFILE,
    );

    expect(signal.value).toBe(1);
  });

  it('ферму видно, навіть якщо в чаті є учасник лише з короткими повідомленнями', () => {
    const shortRepliesOnly: FixtureMessage[] = ['ок', 'так', '+1'].map((text, index) => ({
      participantId: 'quiet',
      sentAt: at(index * 10, 20),
      text,
    }));

    const result = analyzeCoordinationFromMessages(
      [...copyPasteFarm.messages, ...shortRepliesOnly],
      DEFAULT_PROFILE,
    );

    expect(sortedGroups(result.groups)).toEqual([['bot1', 'bot2', 'bot3']]);
  });

  it('ланцюжок A-B-C зі слабким звʼязком A-C лишається однією групою', () => {
    // A and C share no text, they are linked only through B
    const chain: FixtureMessage[] = [
      { participantId: 'A', sentAt: at(0, 0), text: 'Голосуйте за Петренка, він дбає про місто' },
      { participantId: 'B', sentAt: at(0, 10), text: 'Голосуйте за Петренка, він дбає про місто' },
      { participantId: 'B', sentAt: at(30, 0), text: 'Петренко відремонтував дороги в районі' },
      { participantId: 'C', sentAt: at(30, 15), text: 'Петренко відремонтував дороги в районі' },
    ];

    const result = analyzeCoordinationFromMessages(chain, DEFAULT_PROFILE);

    expect(sortedGroups(result.groups)).toEqual([['A', 'B', 'C']]);
  });
});

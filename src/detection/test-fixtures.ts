import type { DetectionProfileConfig, DetectorMessage, GraphThresholdProfile } from './types';

export type FixtureMessage = DetectorMessage & { participantId: string };

export type ChatScenario = {
  messages: FixtureMessage[];
  expectedGroups: string[][];
};

// Same values as the default profile seeded by drizzle/0001_seed_default_profile.sql
export const DEFAULT_PROFILE: DetectionProfileConfig & GraphThresholdProfile = {
  syncGapSec: 60,
  windowMinutes: 30,
  windowMaxMessages: 500,
  minTextLength: 12,
  simThreshold: 0.6,
  wText: 0.5,
  wCoactivity: 0.3,
  wCosharing: 0.2,
  edgeThreshold: 0.5,
  keepThreshold: 0.2,
};

const CHAT_START = Date.UTC(2026, 8, 10, 12, 0, 0);
const MS_IN_SECOND = 1000;
const SECONDS_IN_MINUTE = 60;

export function at(minutes: number, seconds = 0) {
  return new Date(CHAT_START + (minutes * SECONDS_IN_MINUTE + seconds) * MS_IN_SECOND);
}

function message(participantId: string, sentAt: Date, text: string): FixtureMessage {
  return { participantId, sentAt, text };
}

const BACKGROUND_CHATTER: FixtureMessage[] = [
  message('alice', at(1, 10), 'Хто сьогодні йде на футбол на центральний стадіон?'),
  message('alice', at(13, 40), 'Я візьму квитки на всіх, напишіть мені в особисті'),
  message('alice', at(27, 5), 'Вже на місці, чекаю біля головного входу'),
];

const ELECTION_POSTS = [
  'Голосуйте за Петренка, він єдиний, хто справді дбає про наше місто!',
  'Петренко відремонтував дороги у трьох районах за один рік, перевірте самі',
  'Не вірте чуткам про Петренка, це замовна кампанія його конкурентів',
];

export const copyPasteFarm: ChatScenario = {
  messages: [
    ...ELECTION_POSTS.flatMap((text, round) => [
      message('bot1', at(round * 10, 5), text),
      message('bot2', at(round * 10, 12), text),
      message('bot3', at(round * 10, 31), text),
    ]),
    ...BACKGROUND_CHATTER,
  ],
  expectedGroups: [['bot1', 'bot2', 'bot3']],
};

export const paraphraseFarm: ChatScenario = {
  messages: [
    message(
      'bot1',
      at(5, 0),
      'Голосуйте за Петренка, бо він єдиний, хто справді дбає про наше місто.',
    ),
    message(
      'bot2',
      at(5, 20),
      'Голосуйте за Петренка! Він єдиний, хто справді дбає про наше рідне місто',
    ),
    message(
      'bot3',
      at(5, 45),
      'Голосуйте за пана Петренка, він єдиний, хто справді дбає про наше місто',
    ),
    message(
      'bot4',
      at(6, 10),
      'Всі голосуйте за Петренка, він єдиний хто справді дбає про наше місто!!!',
    ),
    ...BACKGROUND_CHATTER,
  ],
  expectedGroups: [['bot1', 'bot2', 'bot3', 'bot4']],
};

export const timeSpreadFarm: ChatScenario = {
  messages: [
    message('bot1', at(0, 0), ELECTION_POSTS[0]),
    message('bot2', at(120, 0), ELECTION_POSTS[0]),
    message('bot3', at(240, 0), ELECTION_POSTS[0]),
    ...BACKGROUND_CHATTER,
  ],
  expectedGroups: [['bot1', 'bot2', 'bot3']],
};

export const linkSharingFarm: ChatScenario = {
  messages: [
    message(
      'promo1',
      at(3, 0),
      'Нарешті хтось сказав правду #вибори2026 https://pravda-news.com.ua/article/1',
    ),
    message(
      'promo2',
      at(3, 25),
      'Обовʼязково прочитайте до кінця pravda-news.com.ua/article/1 #вибори2026',
    ),
    message(
      'promo3',
      at(3, 50),
      'Ось чому я змінив думку #Вибори2026 https://www.pravda-news.com.ua/a/1',
    ),
    ...BACKGROUND_CHATTER,
  ],
  expectedGroups: [['promo1', 'promo2', 'promo3']],
};

export const twoFriendsChatting: ChatScenario = {
  messages: [
    message('olena', at(0, 0), 'Привіт! Як пройшла твоя співбесіда вчора?'),
    message('taras', at(0, 30), 'Чудово, мене запросили на другий етап у пʼятницю'),
    message('olena', at(1, 10), 'Вітаю! А що там треба буде робити на другому етапі?'),
    message('taras', at(1, 40), 'Тестове завдання і розмову з керівником команди'),
    message('olena', at(2, 15), 'Тримаю кулаки, розкажеш потім, як усе пройшло'),
    message('taras', at(2, 50), 'Обовʼязково, дякую за підтримку, ти найкраща'),
  ],
  expectedGroups: [],
};

export const lonelySpammer: ChatScenario = {
  messages: [
    ...Array.from({ length: 8 }, (_, index) =>
      message('spammer', at(index * 3, 0), 'Купуйте найкращі кросівки зі знижкою тільки сьогодні!'),
    ),
    ...BACKGROUND_CHATTER,
    message('bob', at(14, 20), 'Хтось знає, коли відкриється новий спортзал на Лесі Українки?'),
  ],
  expectedGroups: [],
};

export const quietChat: ChatScenario = {
  messages: [
    message('alice', at(0, 0), 'Доброго ранку всім, сьогодні збори о шостій'),
    message('bob', at(95, 0), 'Я трохи запізнюсь, почніть без мене'),
    message('carol', at(210, 0), 'Дякую всім, хто прийшов, наступні збори через тиждень'),
  ],
  expectedGroups: [],
};

export const SCENARIOS = {
  'копіпаст-ферма': copyPasteFarm,
  'ферма з перефразуванням': paraphraseFarm,
  'ферма з рознесенням у часі': timeSpreadFarm,
  'спільне поширення посилань': linkSharingFarm,
  'двоє друзів, які спілкуються між собою': twoFriendsChatting,
  'один активний спамер': lonelySpammer,
  'тихий чат': quietChat,
} satisfies Record<string, ChatScenario>;

export function messagesOf(scenario: ChatScenario, participantId: string) {
  return scenario.messages.filter(
    (fixtureMessage) => fixtureMessage.participantId === participantId,
  );
}

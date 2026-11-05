import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  unique,
} from 'drizzle-orm/sqlite-core';

const createdAt = () =>
  integer({ mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date());

export const detectionProfiles = sqliteTable('detection_profiles', {
  id: integer().primaryKey({ autoIncrement: true }),
  name: text().notNull().unique(),
  syncGapSec: integer().notNull(),
  windowMinutes: integer().notNull(),
  windowMaxMessages: integer().notNull(),
  minTextLength: integer().notNull(),
  simThreshold: real().notNull(),
  wText: real().notNull(),
  wCoactivity: real().notNull(),
  wCosharing: real().notNull(),
  edgeThreshold: real().notNull(),
  keepThreshold: real().notNull(),
});

export const sources = sqliteTable('sources', {
  id: integer().primaryKey({ autoIncrement: true }),
  kind: text({ enum: ['telegram', 'upload'] }).notNull(),
  tgChatId: integer().unique('sources_tg_chat_id_unique'),
  title: text().notNull(),
  profileId: integer()
    .notNull()
    .references(() => detectionProfiles.id),
  isActive: integer({ mode: 'boolean' }).notNull().default(true),
  createdAt: createdAt(),
});

export const participants = sqliteTable(
  'participants',
  {
    id: integer().primaryKey({ autoIncrement: true }),
    sourceId: integer()
      .notNull()
      .references(() => sources.id, { onDelete: 'cascade' }),
    externalId: text().notNull(),
    displayName: text().notNull(),
    firstSeenAt: integer({ mode: 'timestamp_ms' }).notNull(),
    messageCount: integer().notNull().default(0),
  },
  (table) => [
    unique('participants_source_id_external_id_unique').on(table.sourceId, table.externalId),
  ],
);

export const messages = sqliteTable(
  'messages',
  {
    id: integer().primaryKey({ autoIncrement: true }),
    sourceId: integer()
      .notNull()
      .references(() => sources.id, { onDelete: 'cascade' }),
    participantId: integer()
      .notNull()
      .references(() => participants.id, { onDelete: 'cascade' }),
    tgMessageId: integer(),
    sentAt: integer({ mode: 'timestamp_ms' }).notNull(),
    text: text().notNull(),
    normalizedText: text().notNull(),
  },
  (table) => [
    index('messages_source_id_sent_at_idx').on(table.sourceId, table.sentAt),
    // Telegram resends an update when the webhook does not answer in time
    unique('messages_source_id_tg_message_id_unique').on(table.sourceId, table.tgMessageId),
  ],
);

export const snapshots = sqliteTable('snapshots', {
  id: integer().primaryKey({ autoIncrement: true }),
  sourceId: integer()
    .notNull()
    .references(() => sources.id, { onDelete: 'cascade' }),
  computedAt: integer({ mode: 'timestamp_ms' }).notNull(),
  windowStart: integer({ mode: 'timestamp_ms' }).notNull(),
  windowEnd: integer({ mode: 'timestamp_ms' }).notNull(),
});

export const snapshotGroups = sqliteTable('snapshot_groups', {
  id: integer().primaryKey({ autoIncrement: true }),
  snapshotId: integer()
    .notNull()
    .references(() => snapshots.id, { onDelete: 'cascade' }),
  score: real().notNull(),
  memberCount: integer().notNull(),
});

export const groupMembers = sqliteTable(
  'group_members',
  {
    snapshotGroupId: integer()
      .notNull()
      .references(() => snapshotGroups.id, { onDelete: 'cascade' }),
    participantId: integer()
      .notNull()
      .references(() => participants.id, { onDelete: 'cascade' }),
  },
  (table) => [primaryKey({ columns: [table.snapshotGroupId, table.participantId] })],
);

export const pairSignals = sqliteTable(
  'pair_signals',
  {
    id: integer().primaryKey({ autoIncrement: true }),
    snapshotId: integer()
      .notNull()
      .references(() => snapshots.id, { onDelete: 'cascade' }),
    participantAId: integer()
      .notNull()
      .references(() => participants.id, { onDelete: 'cascade' }),
    participantBId: integer()
      .notNull()
      .references(() => participants.id, { onDelete: 'cascade' }),
    signalKind: text({ enum: ['text', 'coactivity', 'cosharing'] }).notNull(),
    value: real().notNull(),
  },
  (table) => [index('pair_signals_snapshot_id_idx').on(table.snapshotId)],
);

export const evidence = sqliteTable('evidence', {
  id: integer().primaryKey({ autoIncrement: true }),
  pairSignalId: integer()
    .notNull()
    .references(() => pairSignals.id, { onDelete: 'cascade' }),
  messageAId: integer()
    .notNull()
    .references(() => messages.id, { onDelete: 'cascade' }),
  messageBId: integer()
    .notNull()
    .references(() => messages.id, { onDelete: 'cascade' }),
});

export const findings = sqliteTable(
  'findings',
  {
    id: integer().primaryKey({ autoIncrement: true }),
    sourceId: integer()
      .notNull()
      .references(() => sources.id, { onDelete: 'cascade' }),
    detectedAt: integer({ mode: 'timestamp_ms' }).notNull(),
    groupKey: text().notNull(),
    score: real().notNull(),
    // Only the latest snapshot is kept, so older findings lose their group but keep their members
    snapshotGroupId: integer().references(() => snapshotGroups.id, { onDelete: 'set null' }),
  },
  (table) => [index('findings_source_id_detected_at_idx').on(table.sourceId, table.detectedAt)],
);

export const findingMembers = sqliteTable(
  'finding_members',
  {
    findingId: integer()
      .notNull()
      .references(() => findings.id, { onDelete: 'cascade' }),
    participantId: integer()
      .notNull()
      .references(() => participants.id, { onDelete: 'cascade' }),
  },
  (table) => [primaryKey({ columns: [table.findingId, table.participantId] })],
);

export const windowMetrics = sqliteTable(
  'window_metrics',
  {
    id: integer().primaryKey({ autoIncrement: true }),
    sourceId: integer()
      .notNull()
      .references(() => sources.id, { onDelete: 'cascade' }),
    windowStart: integer({ mode: 'timestamp_ms' }).notNull(),
    windowEnd: integer({ mode: 'timestamp_ms' }).notNull(),
    maxScore: real().notNull(),
    groupCount: integer().notNull(),
    flaggedParticipants: integer().notNull(),
  },
  (table) => [
    index('window_metrics_source_id_window_start_idx').on(table.sourceId, table.windowStart),
  ],
);

export const admins = sqliteTable('admins', {
  id: integer().primaryKey({ autoIncrement: true }),
  email: text().notNull().unique(),
  addedBy: text(),
  createdAt: createdAt(),
});

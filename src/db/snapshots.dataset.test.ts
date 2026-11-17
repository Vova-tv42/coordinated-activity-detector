import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AppDatabase } from '@/db/connection';
import { loadDataset, readTables } from '@/db/datasets';
import chatWithoutCoordinationExpected from '@/db/datasets/chat-without-coordination.expected.json';
import chatWithoutCoordinationInput from '@/db/datasets/chat-without-coordination.input.json';
import copyPasteFarmExpected from '@/db/datasets/copy-paste-farm.expected.json';
import copyPasteFarmInput from '@/db/datasets/copy-paste-farm.input.json';
import newGroupMemberExpected from '@/db/datasets/new-group-member.expected.json';
import newGroupMemberInput from '@/db/datasets/new-group-member.input.json';
import repeatedAnalysisExpected from '@/db/datasets/repeated-analysis.expected.json';
import { analyzeSource } from '@/db/snapshots';
import { createTestDatabase } from '@/db/test-database';

const SOURCE_ID = 1;
const ANALYSIS_TIME = new Date('2026-09-10T12:30:00Z');
const REPEATED_ANALYSIS_TIME = new Date('2026-09-10T12:30:01Z');
const SNAPSHOT_TABLES = [
  'snapshots',
  'snapshot_groups',
  'group_members',
  'pair_signals',
  'evidence',
  'findings',
  'finding_members',
];

describe('аналіз джерела на наборах даних', () => {
  let database: AppDatabase;

  function readSnapshotTables() {
    return readTables(database, SNAPSHOT_TABLES);
  }

  beforeEach(() => {
    database = createTestDatabase();
  });

  afterEach(() => {
    database.$client.close();
  });

  it('для копіпаст-ферми з трьох учасників зберігає снапшот, групу, сигнали, докази і знахідку', () => {
    loadDataset(database, copyPasteFarmInput);

    analyzeSource(database, SOURCE_ID, ANALYSIS_TIME);

    expect(readSnapshotTables()).toEqual(copyPasteFarmExpected);
  });

  it('для чату без координації зберігає снапшот без груп і знахідок', () => {
    loadDataset(database, chatWithoutCoordinationInput);

    analyzeSource(database, SOURCE_ID, ANALYSIS_TIME);

    expect(readSnapshotTables()).toEqual(chatWithoutCoordinationExpected);
  });

  describe('повторний аналіз після виявленої ферми', () => {
    beforeEach(() => {
      // The state after the first analysis is the farm input plus its expected result
      loadDataset(database, copyPasteFarmInput);
      loadDataset(database, copyPasteFarmExpected);
    });

    it('замінює снапшот і переносить наявну знахідку на нову групу того ж складу', () => {
      analyzeSource(database, SOURCE_ID, REPEATED_ANALYSIS_TIME);

      expect(readSnapshotTables()).toEqual(repeatedAnalysisExpected);
    });

    it('лишає стару знахідку без групи і додає нову, коли до групи приєднується учасник', () => {
      loadDataset(database, newGroupMemberInput);

      analyzeSource(database, SOURCE_ID, REPEATED_ANALYSIS_TIME);

      expect(readSnapshotTables()).toEqual(newGroupMemberExpected);
    });
  });
});

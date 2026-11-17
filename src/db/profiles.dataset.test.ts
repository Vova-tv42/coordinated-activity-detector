import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AppDatabase } from '@/db/connection';
import { loadDataset, readTables } from '@/db/datasets';
import ownProfileUpdateExpected from '@/db/datasets/own-profile-update.expected.json';
import profilesInput from '@/db/datasets/profiles.input.json';
import sharedProfileCopyExpected from '@/db/datasets/shared-profile-copy.expected.json';
import { type DetectionProfileValues, saveSourceProfile } from '@/db/profiles';
import { createTestDatabase } from '@/db/test-database';

const PROFILE_TABLES = ['detection_profiles', 'sources'];
const SOURCE_WITH_OWN_PROFILE_ID = 3;
const SOURCE_WITH_SHARED_PROFILE_ID = 2;
const UPDATED_PROFILE_VALUES: DetectionProfileValues = {
  syncGapSec: 45,
  windowMinutes: 60,
  windowMaxMessages: 300,
  minTextLength: 10,
  simThreshold: 0.7,
  wText: 0.6,
  wCoactivity: 0.2,
  wCosharing: 0.2,
  edgeThreshold: 0.55,
  keepThreshold: 0.25,
};

describe('зміна профілю джерела на наборах даних', () => {
  let database: AppDatabase;

  function readProfileTables() {
    return readTables(database, PROFILE_TABLES);
  }

  beforeEach(() => {
    database = createTestDatabase();
    loadDataset(database, profilesInput);
  });

  afterEach(() => {
    database.$client.close();
  });

  it('оновлює власний профіль джерела на місці', () => {
    saveSourceProfile(database, SOURCE_WITH_OWN_PROFILE_ID, UPDATED_PROFILE_VALUES);

    expect(readProfileTables()).toEqual(ownProfileUpdateExpected);
  });

  it('створює копію спільного профілю, а інше джерело лишає на старому', () => {
    saveSourceProfile(database, SOURCE_WITH_SHARED_PROFILE_ID, UPDATED_PROFILE_VALUES);

    expect(readProfileTables()).toEqual(sharedProfileCopyExpected);
  });

  it.each([
    ['власного', SOURCE_WITH_OWN_PROFILE_ID],
    ['спільного', SOURCE_WITH_SHARED_PROFILE_ID],
  ])('тригер відхиляє w_text = 2 для %s профілю, і стан БД не змінюється', (_, sourceId) => {
    const stateAfterLoading = readProfileTables();

    expect(() =>
      saveSourceProfile(database, sourceId, { ...UPDATED_PROFILE_VALUES, wText: 2 }),
    ).toThrow('detection profile values are out of range');

    expect(readProfileTables()).toEqual(stateAfterLoading);
  });
});

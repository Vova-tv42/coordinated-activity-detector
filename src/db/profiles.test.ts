import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type AppDatabase, openDatabase } from '@/db/connection';
import { type DetectionProfileValues, findSourceProfile, saveSourceProfile } from '@/db/profiles';
import { detectionProfiles, sources } from '@/db/schema';

const calibratedValues: DetectionProfileValues = {
  syncGapSec: 30,
  windowMinutes: 15,
  windowMaxMessages: 200,
  minTextLength: 20,
  simThreshold: 0.7,
  wText: 0.6,
  wCoactivity: 0.2,
  wCosharing: 0.2,
  edgeThreshold: 0.55,
  keepThreshold: 0.3,
};

describe('profiles', () => {
  let database: AppDatabase;

  function createSource(title: string) {
    return database
      .insert(sources)
      .values({ kind: 'telegram', title, profileId: 1 })
      .returning()
      .get().id;
  }

  beforeEach(() => {
    database = openDatabase(':memory:');
    migrate(database, { migrationsFolder: './drizzle' });
  });

  afterEach(() => {
    database.$client.close();
  });

  describe('findSourceProfile', () => {
    it('повертає профіль, привʼязаний до джерела', () => {
      const groupId = createSource('Тестова група');

      expect(findSourceProfile(database, groupId)).toMatchObject({
        id: 1,
        name: 'Стандартний',
        syncGapSec: 60,
      });
    });

    it('повертає undefined для неіснуючого джерела', () => {
      expect(findSourceProfile(database, 999)).toBeUndefined();
    });
  });

  describe('saveSourceProfile', () => {
    it('оновлює профіль на місці, якщо ним користується лише це джерело', () => {
      const groupId = createSource('Тестова група');

      saveSourceProfile(database, groupId, calibratedValues);

      expect(findSourceProfile(database, groupId)).toEqual({
        id: 1,
        name: 'Стандартний',
        ...calibratedValues,
      });
      expect(database.select().from(detectionProfiles).all()).toHaveLength(1);
    });

    it('створює окремий профіль, щоб не змінити параметри інших джерел', () => {
      const groupId = createSource('Тестова група');
      const otherId = createSource('Інша група');

      saveSourceProfile(database, groupId, calibratedValues);

      expect(findSourceProfile(database, groupId)).toMatchObject({
        name: `Тестова група #${groupId}`,
        ...calibratedValues,
      });
      expect(findSourceProfile(database, otherId)).toMatchObject({
        id: 1,
        syncGapSec: 60,
        simThreshold: 0.6,
      });
    });

    it('повторне збереження змінює вже окремий профіль джерела', () => {
      const groupId = createSource('Тестова група');
      createSource('Інша група');

      saveSourceProfile(database, groupId, calibratedValues);
      saveSourceProfile(database, groupId, { ...calibratedValues, syncGapSec: 90 });

      expect(findSourceProfile(database, groupId)?.syncGapSec).toBe(90);
      expect(database.select().from(detectionProfiles).all()).toHaveLength(2);
    });

    it('кидає помилку для неіснуючого джерела', () => {
      expect(() => saveSourceProfile(database, 999, calibratedValues)).toThrow(/999/);
    });
  });
});

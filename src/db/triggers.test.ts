import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AppDatabase } from '@/db/connection';
import { createTestDatabase } from '@/db/test-database';

const VALID_PROFILE = {
  sync_gap_sec: 60,
  window_minutes: 30,
  window_max_messages: 500,
  min_text_length: 12,
  sim_threshold: 0.6,
  w_text: 0.5,
  w_coactivity: 0.3,
  w_cosharing: 0.2,
  edge_threshold: 0.5,
  keep_threshold: 0.2,
};

describe('тригери бази даних', () => {
  let database: AppDatabase;

  function run(sql: string, ...parameters: unknown[]) {
    return database.$client.prepare(sql).run(...parameters);
  }

  function insertProfile(name: string, values: Record<string, number>) {
    const columns = Object.keys(values);
    return run(
      `INSERT INTO detection_profiles (name, ${columns.join(', ')}) VALUES (?, ${columns.map(() => '?').join(', ')})`,
      name,
      ...Object.values(values),
    );
  }

  beforeEach(() => {
    database = createTestDatabase({ withTestData: true });
  });

  afterEach(() => {
    database.$client.close();
  });

  it('після міграцій у базі є всі вісім тригерів', () => {
    const triggerNames = database.$client
      .prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' ORDER BY name")
      .all()
      .map((row) => (row as { name: string }).name);

    expect(triggerNames).toHaveLength(8);
    expect(triggerNames).toContain('messages_participant_from_same_source');
  });

  describe('межі параметрів профілю детекції', () => {
    it('приймає профіль з межовими допустимими значеннями', () => {
      const result = insertProfile('Межовий', {
        ...VALID_PROFILE,
        sync_gap_sec: 1,
        min_text_length: 0,
        sim_threshold: 0,
        edge_threshold: 1,
      });

      expect(result.changes).toBe(1);
    });

    it.each([
      ['sync_gap_sec', 0],
      ['window_minutes', 0],
      ['window_max_messages', 0],
      ['min_text_length', -1],
      ['sim_threshold', 1.1],
      ['w_text', -0.1],
      ['w_coactivity', 2],
      ['w_cosharing', -1],
      ['edge_threshold', 1.5],
      ['keep_threshold', -0.01],
    ])('відхиляє новий профіль, де %s = %s', (column, value) => {
      expect(() => insertProfile('Некоректний', { ...VALID_PROFILE, [column]: value })).toThrow(
        'detection profile values are out of range',
      );
    });

    it('відхиляє зміну профілю на недопустиме значення і лишає старе', () => {
      expect(() => run('UPDATE detection_profiles SET w_text = 3 WHERE id = 2')).toThrow(
        'out of range',
      );

      expect(
        database.$client.prepare('SELECT w_text FROM detection_profiles WHERE id = 2').get(),
      ).toEqual({
        w_text: 0.5,
      });
    });

    it('дозволяє змінювати значення дефолтного профілю в межах', () => {
      expect(run('UPDATE detection_profiles SET sync_gap_sec = 90 WHERE id = 1').changes).toBe(1);
    });
  });

  describe('захист профілю «Стандартний»', () => {
    it('не дає видалити дефолтний профіль, навіть якщо ним ніхто не користується', () => {
      run('UPDATE sources SET profile_id = 2 WHERE id = 1');

      expect(() => run("DELETE FROM detection_profiles WHERE name = 'Стандартний'")).toThrow(
        'default detection profile cannot be deleted',
      );
    });

    it('не дає перейменувати дефолтний профіль', () => {
      expect(() => run("UPDATE detection_profiles SET name = 'Інший' WHERE id = 1")).toThrow(
        'cannot be renamed',
      );
    });

    it('дозволяє видалити невикористаний звичайний профіль', () => {
      insertProfile('Тимчасовий', VALID_PROFILE);

      expect(run("DELETE FROM detection_profiles WHERE name = 'Тимчасовий'").changes).toBe(1);
    });
  });

  describe('допустимі значення типів', () => {
    it('відхиляє джерело з невідомим типом', () => {
      expect(() =>
        run(
          "INSERT INTO sources (kind, title, profile_id, is_active, created_at) VALUES ('rss', 'Стрічка', 1, 1, 0)",
        ),
      ).toThrow('source kind must be telegram or upload');
    });

    it('відхиляє зміну типу наявного джерела на невідомий', () => {
      expect(() => run("UPDATE sources SET kind = 'email' WHERE id = 2")).toThrow('source kind');
    });

    it('відхиляє сигнал пари невідомого виду і приймає відомий', () => {
      expect(() =>
        run(
          "INSERT INTO pair_signals (snapshot_id, participant_a_id, participant_b_id, signal_kind, value) VALUES (1, 1, 2, 'behavior', 0.5)",
        ),
      ).toThrow('signal kind must be text, coactivity or cosharing');
      expect(
        run(
          "INSERT INTO pair_signals (snapshot_id, participant_a_id, participant_b_id, signal_kind, value) VALUES (1, 1, 2, 'cosharing', 0.5)",
        ).changes,
      ).toBe(1);
    });
  });

  describe('учасник повідомлення з того самого джерела', () => {
    it('відхиляє повідомлення джерела 1 від учасника джерела 2', () => {
      expect(() =>
        run(
          "INSERT INTO messages (source_id, participant_id, sent_at, text, normalized_text) VALUES (1, 3, 0, 'чужий учасник', 'чужий учасник')",
        ),
      ).toThrow('message participant belongs to another source');
    });

    it('приймає повідомлення від учасника того самого джерела', () => {
      const result = run(
        "INSERT INTO messages (source_id, participant_id, sent_at, text, normalized_text) VALUES (2, 3, 0, 'свій учасник', 'свій учасник')",
      );

      expect(result.changes).toBe(1);
    });
  });
});

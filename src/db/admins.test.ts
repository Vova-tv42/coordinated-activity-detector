import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addAdmin, findAdmin, hasAdminAccess, listAdmins, removeAdmin } from '@/db/admins';
import { type AppDatabase, openDatabase } from '@/db/connection';

describe('admins', () => {
  let database: AppDatabase;

  beforeEach(() => {
    database = openDatabase(':memory:');
    migrate(database, { migrationsFolder: './drizzle' });
    vi.stubEnv('ADMIN_EMAILS', 'owner@gmail.com');
  });

  afterEach(() => {
    database.$client.close();
    vi.unstubAllEnvs();
  });

  describe('addAdmin', () => {
    it('додає адміністратора в нижньому регістрі і запамʼятовує, хто додав', () => {
      expect(addAdmin(database, ' New.Admin@Gmail.com ', 'Owner@gmail.com')).toBe('added');

      expect(listAdmins(database)).toEqual([
        expect.objectContaining({ email: 'new.admin@gmail.com', addedBy: 'owner@gmail.com' }),
      ]);
    });

    it('не додає ту саму адресу вдруге, навіть в іншому регістрі', () => {
      addAdmin(database, 'new.admin@gmail.com', 'owner@gmail.com');

      expect(addAdmin(database, 'NEW.ADMIN@gmail.com', 'owner@gmail.com')).toBe('already-admin');
      expect(listAdmins(database)).toHaveLength(1);
    });

    it('не дублює в таблиці адресу з ADMIN_EMAILS', () => {
      expect(addAdmin(database, 'Owner@gmail.com', 'owner@gmail.com')).toBe('already-admin');
      expect(listAdmins(database)).toEqual([]);
    });
  });

  describe('hasAdminAccess', () => {
    it('пускає адресу з ADMIN_EMAILS', () => {
      expect(hasAdminAccess(database, 'owner@gmail.com')).toBe(true);
    });

    it('пускає доданого адміністратора без урахування регістру', () => {
      addAdmin(database, 'new.admin@gmail.com', 'owner@gmail.com');

      expect(hasAdminAccess(database, 'New.Admin@Gmail.com')).toBe(true);
    });

    it('не пускає сторонню адресу', () => {
      expect(hasAdminAccess(database, 'stranger@gmail.com')).toBe(false);
    });

    it.each([null, undefined, ''])('не пускає без адреси (%s)', (email) => {
      expect(hasAdminAccess(database, email)).toBe(false);
    });
  });

  describe('removeAdmin', () => {
    it('після видалення адміністратор більше не має доступу', () => {
      addAdmin(database, 'new.admin@gmail.com', 'owner@gmail.com');
      const [admin] = listAdmins(database);

      removeAdmin(database, admin.id);

      expect(findAdmin(database, admin.id)).toBeUndefined();
      expect(hasAdminAccess(database, 'new.admin@gmail.com')).toBe(false);
    });
  });
});

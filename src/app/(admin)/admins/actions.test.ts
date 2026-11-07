import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { Session } from 'next-auth';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addAdminAction, removeAdminAction } from '@/app/(admin)/admins/actions';
import { auth } from '@/auth';
import { addAdmin, findAdmin, listAdmins } from '@/db/admins';
import { type AppDatabase, getDatabase, openDatabase } from '@/db/connection';

// Stub: the test decides who is logged in instead of a real Google session
vi.mock('@/auth', () => ({ auth: vi.fn() }));

// Fake: the actions get an in-memory SQLite database instead of the file on disk
vi.mock('@/db/connection', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/db/connection')>()),
  getDatabase: vi.fn(),
}));

// Spy: records which paths the actions ask Next to refresh
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

// Mock: like the real redirect, it stops the action by throwing
vi.mock('next/navigation', () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT ${path}`);
  }),
}));

const OWNER_EMAIL = 'owner@gmail.com';
const ADMINS_PATH = '/admins';

const mockedAuth = vi.mocked(auth as () => Promise<Session | null>);

function logInAs(email: string | null) {
  const session = email ? { user: { email }, expires: '2026-12-31T00:00:00.000Z' } : null;
  mockedAuth.mockResolvedValue(session);
}

function createFormData(fields: Record<string, string>) {
  const formData = new FormData();
  for (const [name, value] of Object.entries(fields)) {
    formData.set(name, value);
  }
  return formData;
}

describe('admin actions', () => {
  let database: AppDatabase;

  beforeEach(() => {
    database = openDatabase(':memory:');
    migrate(database, { migrationsFolder: './drizzle' });
    vi.mocked(getDatabase).mockReturnValue(database);
    vi.stubEnv('ADMIN_EMAILS', OWNER_EMAIL);
    logInAs(OWNER_EMAIL);
  });

  afterEach(() => {
    database.$client.close();
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  describe('addAdminAction', () => {
    it('додає адміністратора в нижньому регістрі та оновлює сторінку', async () => {
      const state = await addAdminAction({}, createFormData({ email: ' New.Admin@Gmail.com ' }));

      expect(state).toEqual({ success: 'new.admin@gmail.com тепер може входити в панель.' });
      expect(listAdmins(database)).toHaveLength(1);
      expect(listAdmins(database)[0]).toMatchObject({
        email: 'new.admin@gmail.com',
        addedBy: OWNER_EMAIL,
      });
      expect(revalidatePath).toHaveBeenCalledTimes(1);
      expect(revalidatePath).toHaveBeenCalledWith(ADMINS_PATH);
    });

    it('відхиляє некоректну адресу і повертає введене значення у форму', async () => {
      const state = await addAdminAction({}, createFormData({ email: 'a@b' }));

      expect(state.error).toBe('Введіть коректну адресу електронної пошти.');
      expect(state.email).toBe('a@b');
      expect(state.success).toBeUndefined();
      expect(listAdmins(database)).toEqual([]);
      expect(revalidatePath).not.toHaveBeenCalled();
    });

    it('вважає порожнім запит без поля email', async () => {
      const state = await addAdminAction({}, new FormData());

      expect(state).toEqual({ email: '', error: 'Введіть коректну адресу електронної пошти.' });
    });

    it('не додає адресу, яка вже має доступ, навіть в іншому регістрі', async () => {
      addAdmin(database, 'new.admin@gmail.com', OWNER_EMAIL);

      const state = await addAdminAction({}, createFormData({ email: 'NEW.ADMIN@gmail.com' }));

      expect(state.error).toContain('вже має доступ');
      expect(listAdmins(database)).toHaveLength(1);
      expect(revalidatePath).not.toHaveBeenCalled();
    });

    it('не копіює в таблицю адресу з ADMIN_EMAILS', async () => {
      const state = await addAdminAction({}, createFormData({ email: OWNER_EMAIL }));

      expect(state.error).toEqual(expect.stringContaining('вже має доступ'));
      expect(listAdmins(database)).toEqual([]);
    });

    it('перенаправляє на вхід, якщо сесії немає', async () => {
      logInAs(null);

      await expect(
        addAdminAction({}, createFormData({ email: 'new.admin@gmail.com' })),
      ).rejects.toThrow('NEXT_REDIRECT /login');
      expect(redirect).toHaveBeenCalledWith('/login');
      expect(listAdmins(database)).toEqual([]);
    });

    it('перенаправляє на вхід користувача, який не є адміністратором', async () => {
      logInAs('stranger@gmail.com');

      await expect(
        addAdminAction({}, createFormData({ email: 'friend@gmail.com' })),
      ).rejects.toThrow(/NEXT_REDIRECT/);
      expect(listAdmins(database)).toHaveLength(0);
    });
  });

  describe('removeAdminAction', () => {
    it('видаляє іншого адміністратора та оновлює сторінку', async () => {
      addAdmin(database, 'new.admin@gmail.com', OWNER_EMAIL);
      const [admin] = listAdmins(database);

      await removeAdminAction(createFormData({ adminId: String(admin.id) }));

      expect(findAdmin(database, admin.id)).toBeUndefined();
      expect(revalidatePath).toHaveBeenCalledExactlyOnceWith(ADMINS_PATH);
    });

    it('не дозволяє адміністратору видалити самого себе', async () => {
      addAdmin(database, 'second.admin@gmail.com', OWNER_EMAIL);
      const [secondAdmin] = listAdmins(database);
      logInAs('Second.Admin@gmail.com');

      await removeAdminAction(createFormData({ adminId: String(secondAdmin.id) }));

      expect(findAdmin(database, secondAdmin.id)).toBeDefined();
      expect(revalidatePath).not.toHaveBeenCalled();
    });

    it('нічого не робить для неіснуючого id', async () => {
      addAdmin(database, 'new.admin@gmail.com', OWNER_EMAIL);

      await removeAdminAction(createFormData({ adminId: '999' }));

      expect(listAdmins(database)).toHaveLength(1);
      expect(revalidatePath).not.toHaveBeenCalled();
    });

    it('видалений адміністратор більше не може видаляти інших', async () => {
      addAdmin(database, 'removed.admin@gmail.com', OWNER_EMAIL);
      addAdmin(database, 'other.admin@gmail.com', OWNER_EMAIL);
      const [removedAdmin, otherAdmin] = listAdmins(database);
      await removeAdminAction(createFormData({ adminId: String(removedAdmin.id) }));
      logInAs('removed.admin@gmail.com');

      await expect(
        removeAdminAction(createFormData({ adminId: String(otherAdmin.id) })),
      ).rejects.toThrow('NEXT_REDIRECT /login');
      expect(findAdmin(database, otherAdmin.id)).toBeDefined();
    });
  });
});

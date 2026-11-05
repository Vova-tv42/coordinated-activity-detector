import { afterEach, describe, expect, it, vi } from 'vitest';
import { getEnvAdminEmails, isAllowedAdminEmail } from '@/lib/admin-access';

describe('getEnvAdminEmails', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('розбирає список через кому, прибирає пробіли та порожні елементи', () => {
    vi.stubEnv('ADMIN_EMAILS', ' admin1@gmail.com, Admin2@Gmail.com ,,');
    expect(getEnvAdminEmails()).toEqual(['admin1@gmail.com', 'admin2@gmail.com']);
  });

  it('повертає порожній список, якщо змінна не задана', () => {
    vi.stubEnv('ADMIN_EMAILS', undefined);
    expect(getEnvAdminEmails()).toEqual([]);
  });
});

describe('isAllowedAdminEmail', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('пропускає адресу зі списку', () => {
    vi.stubEnv('ADMIN_EMAILS', 'admin1@gmail.com,admin2@gmail.com');
    expect(isAllowedAdminEmail('admin2@gmail.com')).toBe(true);
  });

  it('порівнює адреси без урахування регістру', () => {
    vi.stubEnv('ADMIN_EMAILS', 'admin1@gmail.com');
    expect(isAllowedAdminEmail('Admin1@Gmail.com')).toBe(true);
  });

  it('відхиляє сторонню адресу', () => {
    vi.stubEnv('ADMIN_EMAILS', 'admin1@gmail.com');
    expect(isAllowedAdminEmail('stranger@gmail.com')).toBe(false);
  });

  it.each([null, undefined, ''])('відхиляє відсутню адресу (%s)', (email) => {
    vi.stubEnv('ADMIN_EMAILS', 'admin1@gmail.com');
    expect(isAllowedAdminEmail(email)).toBe(false);
  });
});

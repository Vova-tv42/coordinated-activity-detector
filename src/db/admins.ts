import { asc, eq } from 'drizzle-orm';
import type { AppDatabase } from '@/db/connection';
import { admins } from '@/db/schema';
import { isAllowedAdminEmail, normalizeEmail } from '@/lib/admin-access';

export type AddAdminResult = 'added' | 'already-admin';

export function listAdmins(database: AppDatabase) {
  return database.select().from(admins).orderBy(asc(admins.createdAt), asc(admins.id)).all();
}

export function findAdmin(database: AppDatabase, adminId: number) {
  return database.select().from(admins).where(eq(admins.id, adminId)).get();
}

export function hasAdminAccess(database: AppDatabase, email: string | null | undefined) {
  if (!email) {
    return false;
  }

  if (isAllowedAdminEmail(email)) {
    return true;
  }

  const admin = database
    .select({ id: admins.id })
    .from(admins)
    .where(eq(admins.email, normalizeEmail(email)))
    .get();
  return Boolean(admin);
}

export function addAdmin(database: AppDatabase, email: string, addedBy: string): AddAdminResult {
  if (hasAdminAccess(database, email)) {
    return 'already-admin';
  }

  database
    .insert(admins)
    .values({ email: normalizeEmail(email), addedBy: normalizeEmail(addedBy) })
    .run();
  return 'added';
}

export function removeAdmin(database: AppDatabase, adminId: number) {
  database.delete(admins).where(eq(admins.id, adminId)).run();
}

'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { auth } from '@/auth';
import { addAdmin, findAdmin, hasAdminAccess, removeAdmin } from '@/db/admins';
import { getDatabase } from '@/db/connection';
import { normalizeEmail } from '@/lib/admin-access';

const ADMINS_PATH = '/admins';
const INVALID_EMAIL_MESSAGE = 'Введіть коректну адресу електронної пошти.';

const emailSchema = z.email({ error: INVALID_EMAIL_MESSAGE });

export type AddAdminFormState = {
  email?: string;
  error?: string;
  success?: string;
};

// Server actions are public POST endpoints, so each one checks the caller again
async function requireCurrentAdminEmail() {
  const session = await auth();
  const currentEmail = session?.user?.email;
  const isCurrentUserAdmin = hasAdminAccess(getDatabase(), currentEmail);
  if (!currentEmail || !isCurrentUserAdmin) {
    redirect('/login');
  }

  return currentEmail;
}

export async function addAdminAction(
  _previousState: AddAdminFormState,
  formData: FormData,
): Promise<AddAdminFormState> {
  const currentEmail = await requireCurrentAdminEmail();
  const submittedEmail = String(formData.get('email') ?? '').trim();

  const parsedEmail = emailSchema.safeParse(submittedEmail);
  if (!parsedEmail.success) {
    return { email: submittedEmail, error: INVALID_EMAIL_MESSAGE };
  }

  const result = addAdmin(getDatabase(), parsedEmail.data, currentEmail);
  if (result === 'already-admin') {
    return { email: submittedEmail, error: 'Ця адреса вже має доступ до панелі.' };
  }

  revalidatePath(ADMINS_PATH);
  return { success: `${normalizeEmail(parsedEmail.data)} тепер може входити в панель.` };
}

export async function removeAdminAction(formData: FormData) {
  const currentEmail = await requireCurrentAdminEmail();
  const database = getDatabase();
  const admin = findAdmin(database, Number(formData.get('adminId')));

  const isRemovingSelf = admin?.email === normalizeEmail(currentEmail);
  if (!admin || isRemovingSelf) {
    return;
  }

  removeAdmin(database, admin.id);
  revalidatePath(ADMINS_PATH);
}

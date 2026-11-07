export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function getEnvAdminEmails(): string[] {
  const adminEmailsSetting = process.env.ADMIN_EMAILS ?? '';

  return adminEmailsSetting
    .split(',')
    .map(normalizeEmail)
    .filter((email) => email.length > 0);
}

export function isAllowedAdminEmail(email: string | null | undefined): boolean {
  if (!email) {
    return false;
  }

  return getEnvAdminEmails().includes(normalizeEmail(email));
}

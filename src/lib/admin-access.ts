export function getEnvAdminEmails(): string[] {
  const adminEmailsSetting = process.env.ADMIN_EMAILS ?? '';

  return adminEmailsSetting
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter((email) => email.length > 0);
}

export function isAllowedAdminEmail(email: string | null | undefined): boolean {
  if (!email) {
    return false;
  }

  return getEnvAdminEmails().includes(email.trim().toLowerCase());
}

export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') {
    return;
  }

  const { migrateDatabase } = await import('@/db/connection');
  migrateDatabase();

  const idleTimeoutMinutes = process.env.IDLE_TIMEOUT_MINUTES;
  if (!idleTimeoutMinutes) {
    return;
  }

  const { startIdleShutdown } = await import('@/lib/idle-shutdown');
  startIdleShutdown(idleTimeoutMinutes);
}

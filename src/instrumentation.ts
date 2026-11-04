export async function register() {
  const idleTimeoutMinutes = process.env.IDLE_TIMEOUT_MINUTES;
  if (process.env.NEXT_RUNTIME !== 'nodejs' || !idleTimeoutMinutes) {
    return;
  }

  const { startIdleShutdown } = await import('@/lib/idle-shutdown');
  startIdleShutdown(idleTimeoutMinutes);
}

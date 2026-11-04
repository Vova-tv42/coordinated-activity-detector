const MS_IN_MINUTE = 60_000;
const IDLE_CHECK_INTERVAL_MS = 30_000;

// Proxy and instrumentation are bundled separately, so module state is not shared between them
const processState = globalThis as typeof globalThis & { lastRequestAt?: number };

export function markRequestActivity() {
  processState.lastRequestAt = Date.now();
}

export function startIdleShutdown(idleTimeoutMinutes: string) {
  const idleTimeoutMs = Number(idleTimeoutMinutes) * MS_IN_MINUTE;
  const isValidTimeout = Number.isFinite(idleTimeoutMs) && idleTimeoutMs > 0;
  if (!isValidTimeout) {
    throw new Error(`Invalid IDLE_TIMEOUT_MINUTES value: "${idleTimeoutMinutes}"`);
  }

  markRequestActivity();

  setInterval(() => {
    const idleForMs = Date.now() - (processState.lastRequestAt ?? 0);
    if (idleForMs >= idleTimeoutMs) {
      process.exit(0);
    }
  }, IDLE_CHECK_INTERVAL_MS).unref();
}

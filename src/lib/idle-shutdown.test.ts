import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { markRequestActivity, startIdleShutdown } from '@/lib/idle-shutdown';

const MINUTE_MS = 60_000;

describe('startIdleShutdown', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    exitSpy.mockRestore();
  });

  it('завершує процес з кодом 0 після 15 хвилин без запитів', () => {
    startIdleShutdown('15');
    vi.advanceTimersByTime(15 * MINUTE_MS);

    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('не завершує процес раніше за таймаут', () => {
    startIdleShutdown('15');
    vi.advanceTimersByTime(14 * MINUTE_MS);

    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('новий запит відкладає зупинку на повний таймаут', () => {
    startIdleShutdown('15');

    vi.advanceTimersByTime(10 * MINUTE_MS);
    markRequestActivity();
    vi.advanceTimersByTime(10 * MINUTE_MS);
    expect(exitSpy).not.toHaveBeenCalled();

    vi.advanceTimersByTime(5 * MINUTE_MS);
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it.each(['abc', '0', '-5', ''])('відхиляє некоректне значення таймауту "%s"', (value) => {
    expect(() => startIdleShutdown(value)).toThrow('Invalid IDLE_TIMEOUT_MINUTES');
  });
});

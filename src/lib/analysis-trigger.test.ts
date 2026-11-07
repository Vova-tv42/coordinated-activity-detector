import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ANALYSIS_DEBOUNCE_MS, createAnalysisTrigger } from '@/lib/analysis-trigger';

describe('createAnalysisTrigger', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('запускає аналіз через 5 секунд після останнього повідомлення', () => {
    const analyzeSource = vi.fn();
    const scheduleAnalysis = createAnalysisTrigger(analyzeSource);

    scheduleAnalysis(1);
    vi.advanceTimersByTime(ANALYSIS_DEBOUNCE_MS - 1);
    expect(analyzeSource).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(analyzeSource).toHaveBeenCalledWith(1);
  });

  it('обʼєднує порцію повідомлень в один запуск', () => {
    const analyzeSource = vi.fn();
    const scheduleAnalysis = createAnalysisTrigger(analyzeSource);

    scheduleAnalysis(1);
    vi.advanceTimersByTime(ANALYSIS_DEBOUNCE_MS - 1);
    scheduleAnalysis(1);
    vi.advanceTimersByTime(ANALYSIS_DEBOUNCE_MS - 1);
    expect(analyzeSource).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(analyzeSource).toHaveBeenCalledOnce();
  });

  it('рахує дебаунс для кожного джерела окремо', () => {
    const analyzeSource = vi.fn();
    const scheduleAnalysis = createAnalysisTrigger(analyzeSource);

    scheduleAnalysis(1);
    scheduleAnalysis(2);
    vi.advanceTimersByTime(ANALYSIS_DEBOUNCE_MS);

    expect(analyzeSource.mock.calls).toEqual([[1], [2]]);
  });

  it('логує помилку аналізу і не зупиняє наступні запуски', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const analyzeSource = vi.fn().mockImplementationOnce(() => {
      throw new Error('broken profile');
    });
    const scheduleAnalysis = createAnalysisTrigger(analyzeSource);

    scheduleAnalysis(1);
    vi.advanceTimersByTime(ANALYSIS_DEBOUNCE_MS);
    scheduleAnalysis(1);
    vi.advanceTimersByTime(ANALYSIS_DEBOUNCE_MS);

    expect(consoleError).toHaveBeenCalledOnce();
    expect(analyzeSource).toHaveBeenCalledTimes(2);
  });
});

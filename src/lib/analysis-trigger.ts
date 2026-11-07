export const ANALYSIS_DEBOUNCE_MS = 5000;

export function createAnalysisTrigger(analyzeSource: (sourceId: number) => void) {
  const pendingTimers = new Map<number, NodeJS.Timeout>();

  function runAnalysis(sourceId: number) {
    pendingTimers.delete(sourceId);
    try {
      analyzeSource(sourceId);
    } catch (error) {
      // The timer has no caller to catch the error, and an uncaught one would stop the server
      console.error(`Analysis of source ${sourceId} failed`, error);
    }
  }

  return function scheduleAnalysis(sourceId: number) {
    clearTimeout(pendingTimers.get(sourceId));
    pendingTimers.set(sourceId, setTimeout(runAnalysis, ANALYSIS_DEBOUNCE_MS, sourceId));
  };
}

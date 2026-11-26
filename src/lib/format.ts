const SCORE_FRACTION_DIGITS = 2;

const sentAtFormat = new Intl.DateTimeFormat('uk-UA', {
  dateStyle: 'short',
  timeStyle: 'medium',
  timeZone: 'Europe/Kyiv',
});

const chartTimeFormat = new Intl.DateTimeFormat('uk-UA', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Kyiv',
});

export function formatScore(score: number) {
  return score.toFixed(SCORE_FRACTION_DIGITS);
}

export function formatDateTime(isoDate: string) {
  return sentAtFormat.format(new Date(isoDate));
}

export function formatChartTime(isoDate: string) {
  return chartTimeFormat.format(new Date(isoDate));
}

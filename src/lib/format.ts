const SCORE_FRACTION_DIGITS = 2;

const sentAtFormat = new Intl.DateTimeFormat('uk-UA', {
  dateStyle: 'short',
  timeStyle: 'medium',
  timeZone: 'Europe/Kyiv',
});

export function formatScore(score: number) {
  return score.toFixed(SCORE_FRACTION_DIGITS);
}

export function formatDateTime(isoDate: string) {
  return sentAtFormat.format(new Date(isoDate));
}

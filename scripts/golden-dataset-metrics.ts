import { evaluateGoldenDataset, MIN_F1_SCORE, type PairMetrics } from '@/golden-dataset/metrics';

const FILE_COLUMN_WIDTH = 26;
const COUNT_COLUMN_WIDTH = 5;
const METRIC_COLUMN_WIDTH = 10;
const METRIC_FRACTION_DIGITS = 2;
const UNDEFINED_METRIC = '-';

function formatMetric(value: number | null) {
  return value === null ? UNDEFINED_METRIC : value.toFixed(METRIC_FRACTION_DIGITS);
}

function formatRow(label: string, metrics: PairMetrics) {
  return [
    label.padEnd(FILE_COLUMN_WIDTH),
    String(metrics.truePositives).padStart(COUNT_COLUMN_WIDTH),
    String(metrics.falsePositives).padStart(COUNT_COLUMN_WIDTH),
    String(metrics.falseNegatives).padStart(COUNT_COLUMN_WIDTH),
    formatMetric(metrics.precision).padStart(METRIC_COLUMN_WIDTH),
    formatMetric(metrics.recall).padStart(METRIC_COLUMN_WIDTH),
    formatMetric(metrics.f1).padStart(METRIC_COLUMN_WIDTH),
  ].join(' ');
}

const { entries, total } = evaluateGoldenDataset();
const header = [
  'Лог'.padEnd(FILE_COLUMN_WIDTH),
  'TP'.padStart(COUNT_COLUMN_WIDTH),
  'FP'.padStart(COUNT_COLUMN_WIDTH),
  'FN'.padStart(COUNT_COLUMN_WIDTH),
  'Precision'.padStart(METRIC_COLUMN_WIDTH),
  'Recall'.padStart(METRIC_COLUMN_WIDTH),
  'F1'.padStart(METRIC_COLUMN_WIDTH),
].join(' ');
const separator = '-'.repeat(header.length);

const isAboveThreshold = (total.f1 ?? 0) >= MIN_F1_SCORE;
const verdict = isAboveThreshold
  ? `F1 ${formatMetric(total.f1)} не нижче порогу ${MIN_F1_SCORE}`
  : `F1 ${formatMetric(total.f1)} нижче порогу ${MIN_F1_SCORE}`;

const lines = [
  header,
  separator,
  ...entries.map((entry) => formatRow(entry.fileName, entry)),
  separator,
  formatRow('Усього', total),
  '',
  verdict,
];
process.stdout.write(`${lines.join('\n')}\n`);

if (!isAboveThreshold) {
  process.exitCode = 1;
}

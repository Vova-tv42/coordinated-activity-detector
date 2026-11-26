import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { GoldenDatasetReport } from '@/components/golden-dataset-report';
import type { GoldenDatasetEvaluation } from '@/golden-dataset/metrics';

const passingEvaluation: GoldenDatasetEvaluation = {
  entries: [
    {
      fileName: 'copy-paste-farm.json',
      truePositives: 6,
      falsePositives: 0,
      falseNegatives: 0,
      precision: 1,
      recall: 1,
      f1: 1,
    },
    {
      fileName: 'quiet-chat.json',
      truePositives: 0,
      falsePositives: 0,
      falseNegatives: 0,
      precision: null,
      recall: null,
      f1: null,
    },
  ],
  total: {
    truePositives: 6,
    falsePositives: 0,
    falseNegatives: 0,
    precision: 1,
    recall: 1,
    f1: 1,
  },
};

const failingEvaluation: GoldenDatasetEvaluation = {
  entries: [
    {
      fileName: 'paraphrase-farm.json',
      truePositives: 2,
      falsePositives: 0,
      falseNegatives: 4,
      precision: 1,
      recall: 1 / 3,
      f1: 0.5,
    },
  ],
  total: {
    truePositives: 2,
    falsePositives: 0,
    falseNegatives: 4,
    precision: 1,
    recall: 1 / 3,
    f1: 0.5,
  },
};

describe('GoldenDatasetReport', () => {
  it('показує зведені метрики, таблицю логів та пройдений поріг', () => {
    const html = renderToString(<GoldenDatasetReport evaluation={passingEvaluation} />);

    expect(html).toContain('Якість детекції (Golden Dataset)');
    expect(html).toContain('Поріг F1 &gt;= 0.80 пройдено');
    expect(html).toContain('copy-paste-farm.json');
    expect(html).toContain('quiet-chat.json');
    expect(html).toContain('1.00');
    expect(html).toContain('-');
  });

  it('попереджає, коли загальний F1 нижчий за поріг', () => {
    const html = renderToString(<GoldenDatasetReport evaluation={failingEvaluation} />);

    expect(html).toContain('Нижче порогу F1 0.80');
    expect(html).toContain('0.50');
  });
});

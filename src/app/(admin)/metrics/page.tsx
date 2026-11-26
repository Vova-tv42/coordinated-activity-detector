import { connection } from 'next/server';
import { Suspense } from 'react';
import { GoldenDatasetReport } from '@/components/golden-dataset-report';
import { evaluateGoldenDataset } from '@/golden-dataset/metrics';

async function MetricsReportContent() {
  // Golden dataset evaluation runs synchronous SQLite reads, so Next cannot detect them automatically
  await connection();
  const evaluation = evaluateGoldenDataset();

  return <GoldenDatasetReport evaluation={evaluation} />;
}

export default function MetricsPage() {
  return (
    <Suspense fallback={<p className="text-muted-foreground">Обчислення метрик...</p>}>
      <MetricsReportContent />
    </Suspense>
  );
}

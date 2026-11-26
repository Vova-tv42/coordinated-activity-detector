import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { type GoldenDatasetEvaluation, MIN_F1_SCORE } from '@/golden-dataset/metrics';
import { formatScore } from '@/lib/format';

const UNDEFINED_METRIC = '-';

function formatMetricValue(value: number | null) {
  return value === null ? UNDEFINED_METRIC : formatScore(value);
}

type GoldenDatasetReportProps = {
  evaluation: GoldenDatasetEvaluation;
};

export function GoldenDatasetReport({ evaluation }: GoldenDatasetReportProps) {
  const { entries, total } = evaluation;
  const isAboveThreshold = (total.f1 ?? 0) >= MIN_F1_SCORE;
  const summaryMetrics = [
    { label: 'Precision', value: formatMetricValue(total.precision) },
    { label: 'Recall', value: formatMetricValue(total.recall) },
    { label: 'F1', value: formatMetricValue(total.f1) },
    { label: 'TP', value: String(total.truePositives) },
    { label: 'FP', value: String(total.falsePositives) },
    { label: 'FN', value: String(total.falseNegatives) },
  ];

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Якість детекції (Golden Dataset)</CardTitle>
          <CardDescription>
            Оцінка точності виявлення координованих груп на рівні пар учасників для {entries.length}{' '}
            еталонних логів.
          </CardDescription>
          <CardAction>
            <Badge variant={isAboveThreshold ? 'secondary' : 'destructive'}>
              {isAboveThreshold
                ? `Поріг F1 >= ${formatScore(MIN_F1_SCORE)} пройдено`
                : `Нижче порогу F1 ${formatScore(MIN_F1_SCORE)}`}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-6">
            {summaryMetrics.map((metric) => (
              <div key={metric.label} className="flex flex-col gap-1">
                <span className="text-muted-foreground">{metric.label}</span>
                <span>{metric.value}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Результати за логами</CardTitle>
          <CardDescription>
            Порівняння знайдених пар учасників із розміченим Ground Truth. Значення &quot;-&quot;
            означає, що метрика не визначена.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Лог</TableHead>
                <TableHead className="text-right">TP</TableHead>
                <TableHead className="text-right">FP</TableHead>
                <TableHead className="text-right">FN</TableHead>
                <TableHead className="text-right">Precision</TableHead>
                <TableHead className="text-right">Recall</TableHead>
                <TableHead className="text-right">F1</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry) => (
                <TableRow key={entry.fileName}>
                  <TableCell>{entry.fileName}</TableCell>
                  <TableCell className="text-right">{entry.truePositives}</TableCell>
                  <TableCell className="text-right">{entry.falsePositives}</TableCell>
                  <TableCell className="text-right">{entry.falseNegatives}</TableCell>
                  <TableCell className="text-right">{formatMetricValue(entry.precision)}</TableCell>
                  <TableCell className="text-right">{formatMetricValue(entry.recall)}</TableCell>
                  <TableCell className="text-right">{formatMetricValue(entry.f1)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell>Усього</TableCell>
                <TableCell className="text-right">{total.truePositives}</TableCell>
                <TableCell className="text-right">{total.falsePositives}</TableCell>
                <TableCell className="text-right">{total.falseNegatives}</TableCell>
                <TableCell className="text-right">{formatMetricValue(total.precision)}</TableCell>
                <TableCell className="text-right">{formatMetricValue(total.recall)}</TableCell>
                <TableCell className="text-right">{formatMetricValue(total.f1)}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

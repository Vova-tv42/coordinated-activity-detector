import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { SourceLiveView } from '@/components/source-live-view';
import { Button } from '@/components/ui/button';
import { getDatabase } from '@/db/connection';
import { loadSourceLiveData } from '@/db/snapshots';
import { listWindowMetrics } from '@/db/timeline';

async function SourceDetails({ params }: Pick<PageProps<'/sources/[id]'>, 'params'>) {
  const { id } = await params;
  const isSourceIdNumber = /^[1-9]\d*$/.test(id);
  if (!isSourceIdNumber) {
    notFound();
  }

  const database = getDatabase();
  const liveData = loadSourceLiveData(database, Number(id));
  if (!liveData) {
    notFound();
  }

  const timeline = listWindowMetrics(database, liveData.source.id).map((windowMetric) => ({
    windowEnd: windowMetric.windowEnd.toISOString(),
    maxScore: windowMetric.maxScore,
    flaggedParticipants: windowMetric.flaggedParticipants,
  }));

  return <SourceLiveView initialData={liveData} timeline={timeline} />;
}

export default function SourcePage({ params }: PageProps<'/sources/[id]'>) {
  return (
    <div className="flex flex-col gap-4">
      <Button variant="ghost" className="self-start" asChild>
        <Link href="/">До списку джерел</Link>
      </Button>
      <Suspense fallback={<p className="text-muted-foreground">Завантаження...</p>}>
        <SourceDetails params={params} />
      </Suspense>
    </div>
  );
}

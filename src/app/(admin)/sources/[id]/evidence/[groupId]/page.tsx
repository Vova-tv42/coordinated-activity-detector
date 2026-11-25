import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { getDatabase } from '@/db/connection';
import { type GroupEvidenceMessage, loadGroupEvidence } from '@/db/snapshots';
import { formatDateTime, formatScore } from '@/lib/format';

function parsePositiveId(value: string) {
  const isPositiveInteger = /^[1-9]\d*$/.test(value);
  if (!isPositiveInteger) {
    notFound();
  }
  return Number(value);
}

function EvidenceMessageColumn({ message }: { message: GroupEvidenceMessage }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-medium text-sm">{message.authorName}</span>
        <span className="text-muted-foreground text-xs">{formatDateTime(message.sentAt)}</span>
      </div>
      <p className="whitespace-pre-wrap break-words text-sm">{message.text}</p>
    </div>
  );
}

async function GroupEvidenceDetails({
  params,
}: Pick<PageProps<'/sources/[id]/evidence/[groupId]'>, 'params'>) {
  const { id, groupId } = await params;
  const sourceId = parsePositiveId(id);
  const parsedGroupId = parsePositiveId(groupId);

  const data = loadGroupEvidence(getDatabase(), sourceId, parsedGroupId);
  if (!data) {
    notFound();
  }

  return (
    <div className="flex flex-col gap-4">
      <Button variant="ghost" className="self-start" asChild>
        <Link href={`/sources/${data.source.id}`}>До джерела</Link>
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>Докази по групі</CardTitle>
          <CardDescription>
            {data.source.title} - аналіз від {formatDateTime(data.group.computedAt)}
          </CardDescription>
          <CardAction>
            <Badge variant="secondary">Скор: {formatScore(data.group.score)}</Badge>
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {data.group.memberNames.map((memberName) => (
            <Badge key={memberName} variant="outline">
              {memberName}
            </Badge>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Пари схожих повідомлень</CardTitle>
          <CardDescription>
            Повідомлення учасників групи, на яких базується текстовий сигнал координації.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.evidencePairs.length === 0 ? (
            <p className="text-muted-foreground">
              Текстових пар-доказів немає - групу виявлено за синхронністю активності або спільними
              посиланнями.
            </p>
          ) : (
            <div className="flex flex-col gap-4">
              {data.evidencePairs.map((pair) => (
                <Card key={pair.id} size="sm">
                  <CardContent className="grid gap-4 md:grid-cols-2">
                    <EvidenceMessageColumn message={pair.messageA} />
                    <EvidenceMessageColumn message={pair.messageB} />
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function GroupEvidencePage({
  params,
}: PageProps<'/sources/[id]/evidence/[groupId]'>) {
  return (
    <Suspense fallback={<p className="text-muted-foreground">Завантаження...</p>}>
      <GroupEvidenceDetails params={params} />
    </Suspense>
  );
}

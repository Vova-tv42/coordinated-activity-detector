import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { SourceKindBadge } from '@/components/source-kind-badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { getDatabase } from '@/db/connection';
import { findSource, listRecentMessages } from '@/db/sources';

const RECENT_MESSAGES_LIMIT = 100;

const sentAtFormat = new Intl.DateTimeFormat('uk-UA', {
  dateStyle: 'short',
  timeStyle: 'medium',
  timeZone: 'Europe/Kyiv',
});

async function SourceMessages({ params }: Pick<PageProps<'/sources/[id]'>, 'params'>) {
  const { id } = await params;
  const isSourceIdNumber = /^[1-9]\d*$/.test(id);
  if (!isSourceIdNumber) {
    notFound();
  }

  const database = getDatabase();
  const source = findSource(database, Number(id));
  if (!source) {
    notFound();
  }

  const recentMessages = listRecentMessages(database, source.id, RECENT_MESSAGES_LIMIT);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{source.title}</CardTitle>
        <CardAction className="flex items-center gap-2">
          <SourceKindBadge kind={source.kind} />
          <Button variant="outline" size="sm" asChild>
            <Link href={`/sources/${source.id}/profile`}>Параметри аналізу</Link>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {recentMessages.length === 0 ? (
          <p className="text-muted-foreground">Повідомлень ще немає.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Час</TableHead>
                <TableHead>Автор</TableHead>
                <TableHead>Текст</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentMessages.map((message) => (
                <TableRow key={message.id}>
                  <TableCell>{sentAtFormat.format(message.sentAt)}</TableCell>
                  <TableCell>{message.authorName}</TableCell>
                  <TableCell className="min-w-64 whitespace-normal">{message.text}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

export default function SourcePage({ params }: PageProps<'/sources/[id]'>) {
  return (
    <div className="flex flex-col gap-4">
      <Button variant="ghost" className="self-start" asChild>
        <Link href="/">До списку джерел</Link>
      </Button>
      <Suspense fallback={<p className="text-muted-foreground">Завантаження...</p>}>
        <SourceMessages params={params} />
      </Suspense>
    </div>
  );
}

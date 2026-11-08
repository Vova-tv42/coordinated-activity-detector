import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { SourceKindBadge } from '@/components/source-kind-badge';
import { Button } from '@/components/ui/button';
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
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { getDatabase } from '@/db/connection';
import { findSourceProfile } from '@/db/profiles';
import { findLatestSnapshot, listSnapshotGroups, listSnapshotPairs } from '@/db/snapshots';
import { findSource, listRecentMessages } from '@/db/sources';

const RECENT_MESSAGES_LIMIT = 100;
const SCORE_FRACTION_DIGITS = 2;

const sentAtFormat = new Intl.DateTimeFormat('uk-UA', {
  dateStyle: 'short',
  timeStyle: 'medium',
  timeZone: 'Europe/Kyiv',
});

function formatScore(score: number) {
  return score.toFixed(SCORE_FRACTION_DIGITS);
}

async function SourceDetails({ params }: Pick<PageProps<'/sources/[id]'>, 'params'>) {
  const { id } = await params;
  const isSourceIdNumber = /^[1-9]\d*$/.test(id);
  if (!isSourceIdNumber) {
    notFound();
  }

  const database = getDatabase();
  const source = findSource(database, Number(id));
  const profile = findSourceProfile(database, Number(id));
  if (!source || !profile) {
    notFound();
  }

  const snapshot = findLatestSnapshot(database, source.id);
  const groups = snapshot ? listSnapshotGroups(database, snapshot.id) : [];
  const pairs = snapshot ? listSnapshotPairs(database, snapshot.id, profile) : [];
  const recentMessages = listRecentMessages(database, source.id, RECENT_MESSAGES_LIMIT);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{source.title}</CardTitle>
          <CardDescription>
            {snapshot
              ? `Останній аналіз: ${sentAtFormat.format(snapshot.computedAt)}`
              : 'Аналіз ще не запускався.'}
          </CardDescription>
          <CardAction className="flex items-center gap-2">
            <SourceKindBadge kind={source.kind} />
            <Button variant="outline" size="sm" asChild>
              <Link href={`/sources/${source.id}/profile`}>Параметри аналізу</Link>
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          {groups.length === 0 ? (
            <p className="text-muted-foreground">Координованих груп не знайдено.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Учасники групи</TableHead>
                  <TableHead className="text-right">Скор</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groups.map((group) => (
                  <TableRow key={group.id}>
                    <TableCell className="whitespace-normal">
                      {group.memberNames.join(', ')}
                    </TableCell>
                    <TableCell className="text-right">{formatScore(group.score)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Пари учасників</CardTitle>
          <CardDescription>
            Пари зі скором від {formatScore(profile.keepThreshold)}, ребро графа від{' '}
            {formatScore(profile.edgeThreshold)}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {pairs.length === 0 ? (
            <p className="text-muted-foreground">Пар зі значущим скором немає.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Учасник A</TableHead>
                  <TableHead>Учасник B</TableHead>
                  <TableHead className="text-right">Текст</TableHead>
                  <TableHead className="text-right">Активність</TableHead>
                  <TableHead className="text-right">Посилання</TableHead>
                  <TableHead className="text-right">Скор</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pairs.map((pair) => (
                  <TableRow key={pair.key}>
                    <TableCell>{pair.participantAName}</TableCell>
                    <TableCell>{pair.participantBName}</TableCell>
                    <TableCell className="text-right">{formatScore(pair.signals.text)}</TableCell>
                    <TableCell className="text-right">
                      {formatScore(pair.signals.coactivity)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatScore(pair.signals.cosharing)}
                    </TableCell>
                    <TableCell className="text-right">{formatScore(pair.score)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Останні повідомлення</CardTitle>
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
    </>
  );
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

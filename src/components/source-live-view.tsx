'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { CoordinationGraph } from '@/components/coordination-graph';
import {
  CoordinationTimeline,
  type CoordinationTimelinePoint,
} from '@/components/coordination-timeline';
import { SourceKindBadge } from '@/components/source-kind-badge';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { SourceLiveData } from '@/db/snapshots';
import { buildCoordinationGraph } from '@/lib/coordination-graph';
import { formatDateTime, formatScore } from '@/lib/format';

const LIVE_POLL_INTERVAL_MS = 5000;

type SourceLiveViewProps = {
  initialData: SourceLiveData;
  timeline: CoordinationTimelinePoint[];
};

export function SourceLiveView({ initialData, timeline }: SourceLiveViewProps) {
  const [liveData, setLiveData] = useState(initialData);
  const { source, thresholds, snapshot, groups, pairs, recentMessages } = liveData;
  const isLiveSource = source.kind === 'telegram' && source.isActive;
  const graphData = useMemo(
    () => buildCoordinationGraph(groups, pairs, thresholds.edgeThreshold),
    [groups, pairs, thresholds.edgeThreshold],
  );
  const hasGraphLinks = graphData.links.length > 0;
  const hasTimeline = timeline.length > 0;

  useEffect(() => {
    setLiveData(initialData);
  }, [initialData]);

  useEffect(() => {
    if (!isLiveSource) {
      return;
    }

    let isCancelled = false;
    let activeController: AbortController | null = null;

    async function pollLiveData() {
      if (document.visibilityState === 'hidden') {
        return;
      }

      activeController?.abort();
      const controller = new AbortController();
      activeController = controller;

      try {
        const response = await fetch(`/api/sources/${source.id}/live`, {
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!response.ok || isCancelled) {
          return;
        }
        const nextData = (await response.json()) as SourceLiveData;
        if (!isCancelled) {
          setLiveData(nextData);
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }
      }
    }

    const intervalId = setInterval(pollLiveData, LIVE_POLL_INTERVAL_MS);

    return () => {
      isCancelled = true;
      clearInterval(intervalId);
      activeController?.abort();
    };
  }, [isLiveSource, source.id]);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{source.title}</CardTitle>
          <CardDescription>
            {snapshot
              ? `Останній аналіз: ${formatDateTime(snapshot.computedAt)}`
              : 'Аналіз ще не запускався.'}
          </CardDescription>
          <CardAction className="flex items-center gap-2">
            {isLiveSource && <Badge variant="outline">Наживо</Badge>}
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
                  <TableHead className="text-right">Докази</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groups.map((group) => (
                  <TableRow key={group.id}>
                    <TableCell className="whitespace-normal">
                      {group.memberNames.join(', ')}
                    </TableCell>
                    <TableCell className="text-right">{formatScore(group.score)}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="outline" size="sm" asChild>
                        <Link href={`/sources/${source.id}/evidence/${group.id}`}>Переглянути</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Граф координації</CardTitle>
          <CardDescription>
            Вузли розфарбовані за групами, ширина ребра відповідає скору пари від{' '}
            {formatScore(thresholds.edgeThreshold)}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {hasGraphLinks ? (
            <CoordinationGraph graphData={graphData} />
          ) : (
            <p className="text-muted-foreground">Зв&apos;язків для побудови графа немає.</p>
          )}
        </CardContent>
      </Card>

      {hasTimeline && (
        <Card>
          <CardHeader>
            <CardTitle>Таймлайн координації</CardTitle>
            <CardDescription>
              Лог проаналізовано ковзним вікном від першого до останнього повідомлення. Точка
              графіка - результат вікна, що закінчується в цей момент.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CoordinationTimeline timeline={timeline} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Пари учасників</CardTitle>
          <CardDescription>
            Пари зі скором від {formatScore(thresholds.keepThreshold)}, ребро графа від{' '}
            {formatScore(thresholds.edgeThreshold)}.
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
                    <TableCell>{formatDateTime(message.sentAt)}</TableCell>
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

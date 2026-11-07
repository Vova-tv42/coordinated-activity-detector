import Link from 'next/link';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { SourceKindBadge } from '@/components/source-kind-badge';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { getDatabase } from '@/db/connection';
import { listSourcesWithCounts } from '@/db/sources';

async function SourcesTable() {
  // SQLite reads are synchronous, so Next cannot detect them and would prerender the page at build time
  await connection();
  const sourceList = listSourcesWithCounts(getDatabase());

  if (sourceList.length === 0) {
    return (
      <p className="text-muted-foreground">
        Джерел ще немає. Додайте бота в групу Telegram як адміністратора.
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Назва</TableHead>
          <TableHead>Тип</TableHead>
          <TableHead className="text-right">Учасники</TableHead>
          <TableHead className="text-right">Повідомлення</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sourceList.map((source) => (
          <TableRow key={source.id}>
            <TableCell>
              <div className="flex items-center gap-2">
                <Link href={`/sources/${source.id}`} className="underline-offset-4 hover:underline">
                  {source.title}
                </Link>
                {!source.isActive && <Badge variant="outline">Неактивне</Badge>}
              </div>
            </TableCell>
            <TableCell>
              <SourceKindBadge kind={source.kind} />
            </TableCell>
            <TableCell className="text-right">{source.participantCount}</TableCell>
            <TableCell className="text-right">{source.messageCount}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export default function SourcesPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Джерела</CardTitle>
        <CardDescription>Групи Telegram і завантажені файли, які аналізує система.</CardDescription>
      </CardHeader>
      <CardContent>
        <Suspense fallback={<p className="text-muted-foreground">Завантаження...</p>}>
          <SourcesTable />
        </Suspense>
      </CardContent>
    </Card>
  );
}

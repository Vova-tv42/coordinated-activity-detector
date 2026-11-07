import { Trash2 } from 'lucide-react';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { removeAdminAction } from '@/app/(admin)/admins/actions';
import { auth } from '@/auth';
import { AddAdminForm } from '@/components/add-admin-form';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { listAdmins } from '@/db/admins';
import { getDatabase } from '@/db/connection';
import { getEnvAdminEmails, normalizeEmail } from '@/lib/admin-access';

const addedAtFormat = new Intl.DateTimeFormat('uk-UA', {
  dateStyle: 'short',
  timeZone: 'Europe/Kyiv',
});

async function AdminsTable() {
  await connection();
  const session = await auth();
  const currentEmail = normalizeEmail(session?.user?.email ?? '');
  const envAdminEmails = getEnvAdminEmails();
  const addedAdmins = listAdmins(getDatabase());

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Email</TableHead>
          <TableHead>Додав</TableHead>
          <TableHead>Дата</TableHead>
          <TableHead>
            <span className="sr-only">Дії</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {envAdminEmails.map((email) => (
          <TableRow key={email}>
            <TableCell>
              <div className="flex items-center gap-2">
                {email}
                <Badge variant="outline">ADMIN_EMAILS</Badge>
              </div>
            </TableCell>
            <TableCell className="text-muted-foreground">Налаштування сервера</TableCell>
            <TableCell />
            <TableCell />
          </TableRow>
        ))}
        {addedAdmins.map((admin) => {
          const isCurrentUser = admin.email === currentEmail;

          return (
            <TableRow key={admin.id}>
              <TableCell>{admin.email}</TableCell>
              <TableCell>{admin.addedBy}</TableCell>
              <TableCell>{addedAtFormat.format(admin.createdAt)}</TableCell>
              <TableCell className="text-right">
                {!isCurrentUser && (
                  <form action={removeAdminAction}>
                    <input type="hidden" name="adminId" value={admin.id} />
                    <Button
                      type="submit"
                      variant="ghost"
                      size="icon"
                      aria-label={`Видалити ${admin.email}`}
                    >
                      <Trash2 />
                    </Button>
                  </form>
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

export default function AdminsPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Адміністратори</CardTitle>
        <CardDescription>
          Адреси з ADMIN_EMAILS задані в налаштуваннях сервера і тут не видаляються.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <AddAdminForm />
        <Suspense fallback={<p className="text-muted-foreground">Завантаження...</p>}>
          <AdminsTable />
        </Suspense>
      </CardContent>
    </Card>
  );
}

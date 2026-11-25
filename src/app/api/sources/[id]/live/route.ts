import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { hasAdminAccess } from '@/db/admins';
import { getDatabase } from '@/db/connection';
import { loadSourceLiveData } from '@/db/snapshots';

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const session = await auth();
  const database = getDatabase();
  const userEmail = session?.user?.email;
  const isAuthorized = Boolean(userEmail) && hasAdminAccess(database, userEmail);
  if (!isAuthorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await context.params;
  const isSourceIdNumber = /^[1-9]\d*$/.test(id);
  if (!isSourceIdNumber) {
    return NextResponse.json({ error: 'Invalid source id' }, { status: 400 });
  }

  const liveData = loadSourceLiveData(database, Number(id));
  if (!liveData) {
    return NextResponse.json({ error: 'Source not found' }, { status: 404 });
  }

  return NextResponse.json(liveData, {
    headers: { 'Cache-Control': 'no-store' },
  });
}

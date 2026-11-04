import { NextResponse } from 'next/server';
import { markRequestActivity } from '@/lib/idle-shutdown';

export function proxy() {
  markRequestActivity();
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};

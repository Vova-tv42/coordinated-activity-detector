import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { markRequestActivity } from '@/lib/idle-shutdown';

const LOGIN_PATH = '/login';
const AUTH_API_PREFIX = '/api/auth/';
// Telegram has no session, the webhook route checks its secret token header instead
const TELEGRAM_WEBHOOK_PATH = '/api/telegram/webhook';

export const proxy = auth((request) => {
  markRequestActivity();

  const { pathname } = request.nextUrl;
  const isLoggedIn = Boolean(request.auth);
  const isLoginPage = pathname === LOGIN_PATH;
  const isTelegramWebhook = pathname === TELEGRAM_WEBHOOK_PATH;
  const isPublicPath = isLoginPage || isTelegramWebhook || pathname.startsWith(AUTH_API_PREFIX);

  if (isLoggedIn && isLoginPage) {
    return NextResponse.redirect(new URL('/', request.nextUrl));
  }

  if (!isLoggedIn && !isPublicPath) {
    return NextResponse.redirect(new URL(LOGIN_PATH, request.nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};

import { Suspense } from 'react';
import { signIn } from '@/auth';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const ACCESS_DENIED_ERROR = 'AccessDenied';

async function signInWithGoogle() {
  'use server';
  await signIn('google', { redirectTo: '/' });
}

async function LoginError({ searchParams }: Pick<PageProps<'/login'>, 'searchParams'>) {
  const { error } = await searchParams;
  if (!error) {
    return null;
  }

  const message =
    error === ACCESS_DENIED_ERROR
      ? 'Цей Google-акаунт не має доступу до панелі.'
      : 'Не вдалося увійти. Спробуйте ще раз.';

  return (
    <Alert variant="destructive">
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}

export default function LoginPage({ searchParams }: PageProps<'/login'>) {
  return (
    <main className="flex min-h-svh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Coordination Detector</CardTitle>
          <CardDescription>Увійдіть через Google, щоб продовжити.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Suspense>
            <LoginError searchParams={searchParams} />
          </Suspense>
          <form action={signInWithGoogle}>
            <Button type="submit" className="w-full">
              Увійти через Google
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}

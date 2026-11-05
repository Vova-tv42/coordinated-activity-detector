import { signOut } from '@/auth';
import { Button } from '@/components/ui/button';

async function signOutToLogin() {
  'use server';
  await signOut({ redirectTo: '/login' });
}

export function SignOutButton() {
  return (
    <form action={signOutToLogin}>
      <Button type="submit" variant="outline">
        Вийти
      </Button>
    </form>
  );
}

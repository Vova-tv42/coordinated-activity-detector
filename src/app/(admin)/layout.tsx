import Link from 'next/link';
import { SignOutButton } from '@/components/sign-out-button';
import { Button } from '@/components/ui/button';

export default function AdminLayout({ children }: LayoutProps<'/'>) {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <Link href="/">Coordination Detector</Link>
        <nav className="flex flex-wrap items-center gap-1">
          <Button variant="ghost" asChild>
            <Link href="/">Джерела</Link>
          </Button>
          <Button variant="ghost" asChild>
            <Link href="/admins">Адміністратори</Link>
          </Button>
          <SignOutButton />
        </nav>
      </header>
      <main>{children}</main>
    </div>
  );
}

import Link from 'next/link';
import { SignOutButton } from '@/components/sign-out-button';

export default function AdminLayout({ children }: LayoutProps<'/'>) {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-4">
      <header className="flex items-center justify-between gap-4">
        <Link href="/">Coordination Detector</Link>
        <SignOutButton />
      </header>
      <main>{children}</main>
    </div>
  );
}

import { SignOutButton } from '@/components/sign-out-button';

export default function Home() {
  return (
    <main className="flex flex-col items-start gap-4 p-4">
      <div>Hello world!</div>
      <SignOutButton />
    </main>
  );
}

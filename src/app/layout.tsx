import type { Metadata } from 'next';
import './globals.css';
import { Geist } from 'next/font/google';
import { cn } from '@/lib/utils';

const geist = Geist({ subsets: ['latin'], variable: '--font-sans' });

export const metadata: Metadata = {
  title: 'Coordination Detector',
  description: 'Виявлення координованої активності в Telegram-групах',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="uk" className={cn('font-sans', geist.variable)}>
      <body>{children}</body>
    </html>
  );
}

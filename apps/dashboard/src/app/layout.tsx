import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'NexusZero — AI Marketing Command Center',
  description: 'Autonomous AI agent swarms managing your marketing, SEO, ads, and creative.',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-background antialiased">
        <Providers session={session}>{children}</Providers>
      </body>
    </html>
  );
}

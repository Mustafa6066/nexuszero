import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'NexusZero — AI Marketing Command Center',
  description: 'Autonomous AI agent swarms managing your marketing, SEO, ads, and creative.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-background antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';
import { getToken } from 'next-auth/jwt';
import { cookies } from 'next/headers';
import type { Session } from 'next-auth';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'NexusZero — AI Marketing Command Center',
  description: 'Autonomous AI agent swarms managing your marketing, SEO, ads, and creative.',
  icons: { icon: '/icon', shortcut: '/icon' },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Use getToken (reads cookie directly) instead of getServerSession to avoid
  // an internal HTTP round-trip to /api/auth/session which can cause timeouts.
  let session: Session | null = null;
  try {
    const cookieStore = cookies();
    const cookieHeader = cookieStore.getAll().map(c => `${c.name}=${c.value}`).join('; ');
    // secureCookie must be true in production (HTTPS) so getToken reads the
    // __Secure-next-auth.session-token cookie instead of next-auth.session-token
    const token = await getToken({
      req: { headers: { cookie: cookieHeader } } as any,
      secret: process.env.NEXTAUTH_SECRET,
      secureCookie: process.env.NODE_ENV === 'production',
    });
    if (token?.accessToken) {
      session = { accessToken: token.accessToken, user: { email: token.email as string }, expires: '' } as any;
    }
  } catch {
    // Session priming failed — client-side SessionProvider will handle it
  }

  const themeInitScript = `(() => {
    try {
      const stored = localStorage.getItem('nz-theme');
      const theme = stored || (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
      document.documentElement.classList.toggle('light', theme === 'light');
    } catch {}
  })();`;

  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-screen bg-background antialiased">
        <Providers session={session}>{children}</Providers>
      </body>
    </html>
  );
}

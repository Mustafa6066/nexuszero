'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Loader2, Zap, ArrowRight } from 'lucide-react';

const _rawBase = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000').replace(/\/$/, '');
const API_BASE = _rawBase.endsWith('/api/v1') ? _rawBase : `${_rawBase}/api/v1`;

export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'form' | 'signing-in'>('form');

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const form = new FormData(e.currentTarget);
    const name = form.get('name') as string;
    const email = form.get('email') as string;
    const password = form.get('password') as string;
    const companyName = form.get('companyName') as string;

    try {
      const res = await fetch(`${API_BASE}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password, companyName }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const msg = data?.error?.details?.reason || data?.error?.message || 'Registration failed. Please try again.';
        setError(msg);
        setLoading(false);
        return;
      }

      // Registration succeeded — now sign in via NextAuth
      setStep('signing-in');
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError('Account created but sign-in failed. Please log in manually.');
        setLoading(false);
        setStep('form');
      } else {
        router.push('/dashboard/onboarding');
      }
    } catch {
      setError('Network error. Please check your connection.');
      setLoading(false);
      setStep('form');
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center bg-background overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-grid opacity-30 pointer-events-none" />
      <div className="absolute inset-0 aurora-bg pointer-events-none" />

      {/* Back to home */}
      <Link href="/" className="absolute top-6 left-6 text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
        ← Back
      </Link>

      {/* Card */}
      <div className="relative w-full max-w-sm mx-4 animate-fade-up">
        <div className="rounded-3xl border border-border bg-card/80 backdrop-blur-xl p-8 shadow-2xl shadow-black/20">
          {/* Logo */}
          <div className="flex flex-col items-center mb-8">
            <div className="h-12 w-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-4">
              <Zap size={22} className="text-primary" />
            </div>
            <h1 className="text-xl font-bold gradient-text">NexusZero</h1>
            <p className="text-xs text-muted-foreground mt-1">Create Your Command Center</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-xs text-destructive">
                {error}
              </div>
            )}

            <div className="space-y-1.5">
              <label htmlFor="name" className="block text-xs font-medium text-muted-foreground">Full Name</label>
              <input
                id="name"
                name="name"
                type="text"
                className="w-full rounded-xl border border-border bg-secondary/50 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40 transition-colors placeholder:text-muted-foreground/50"
                placeholder="Jane Doe"
                required
                autoComplete="name"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="email" className="block text-xs font-medium text-muted-foreground">Email</label>
              <input
                id="email"
                name="email"
                type="email"
                className="w-full rounded-xl border border-border bg-secondary/50 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40 transition-colors placeholder:text-muted-foreground/50"
                placeholder="you@company.com"
                required
                autoComplete="email"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="companyName" className="block text-xs font-medium text-muted-foreground">Company Name</label>
              <input
                id="companyName"
                name="companyName"
                type="text"
                className="w-full rounded-xl border border-border bg-secondary/50 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40 transition-colors placeholder:text-muted-foreground/50"
                placeholder="Acme Corp"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="password" className="block text-xs font-medium text-muted-foreground">Password</label>
              <input
                id="password"
                name="password"
                type="password"
                className="w-full rounded-xl border border-border bg-secondary/50 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40 transition-colors placeholder:text-muted-foreground/50"
                placeholder="••••••••"
                required
                minLength={8}
                autoComplete="new-password"
              />
              <p className="text-[10px] text-muted-foreground/60">Minimum 8 characters</p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/85 transition-all hover:scale-[1.02] active:scale-100 disabled:opacity-60 disabled:pointer-events-none flex items-center justify-center gap-2 mt-2"
            >
              {loading && <Loader2 size={14} className="animate-spin" />}
              {step === 'signing-in' ? 'Launching…' : loading ? 'Creating workspace…' : (
                <>Deploy Command Center <ArrowRight size={14} /></>
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-xs text-muted-foreground/60">
              Already have an account?{' '}
              <Link href="/login" className="text-primary hover:text-primary/80 font-medium transition-colors">
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

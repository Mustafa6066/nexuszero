'use client';

import { useEffect, useState } from 'react';
import { Languages } from 'lucide-react';
import { useLang } from '@/app/providers';

export function LanguageToggle({ className }: { className?: string }) {
  const { locale, setLocale } = useLang();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const next = locale === 'en' ? 'ar' : 'en';
  const label = locale === 'en' ? 'العربية' : 'English';

  return (
    <button
      type="button"
      onClick={() => setLocale(next)}
      aria-label={`Switch to ${next === 'ar' ? 'Arabic' : 'English'}`}
      title={label}
      className={
        className ??
        'inline-flex h-9 w-9 items-center justify-center rounded-full border border-border/60 bg-card/80 text-muted-foreground shadow-sm shadow-black/5 backdrop-blur transition-all hover:border-primary/30 hover:bg-secondary hover:text-foreground'
      }
    >
      {mounted ? (
        <span className="text-[10px] font-bold leading-none">{locale === 'en' ? 'ع' : 'En'}</span>
      ) : (
        <Languages className="h-4 w-4" />
      )}
    </button>
  );
}

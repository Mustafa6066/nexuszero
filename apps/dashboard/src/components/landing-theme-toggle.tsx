'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/app/providers';

export function LandingThemeToggle() {
  const { theme, toggle } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={!mounted || theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      title={!mounted || theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border/60 bg-card/80 text-muted-foreground shadow-sm shadow-black/5 backdrop-blur transition-all hover:border-primary/30 hover:bg-secondary hover:text-foreground"
    >
      {mounted ? (theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />) : <span className="block h-4 w-4" />}
    </button>
  );
}
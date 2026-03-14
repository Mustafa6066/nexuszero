'use client';

import { useState, useEffect } from 'react';
import { NexusIcon } from './nexus-icon';

const THINKING_STEPS = [
  'Reading tenant context…',
  'Analyzing live signals…',
  'Preparing next action…',
];

/**
 * Claude-style thinking indicator that shows progressive steps
 * while the assistant is generating a response.
 */
export function ThinkingIndicator() {
  const [stepIndex, setStepIndex] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  // Rotate through thinking steps
  useEffect(() => {
    const interval = setInterval(() => {
      setStepIndex((prev) => (prev + 1) % THINKING_STEPS.length);
    }, 2800);
    return () => clearInterval(interval);
  }, []);

  // Elapsed timer
  useEffect(() => {
    const timer = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex gap-3 px-4 py-3 msg-enter">
      <div className="mt-6 flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl border border-primary/18 bg-[linear-gradient(145deg,hsl(var(--primary)/0.16),transparent)] pulse-ring">
        <NexusIcon size={16} thinking active className="text-primary" />
      </div>

      <div className="flex-1 max-w-[88%] thinking-container">
        <div className="overflow-hidden rounded-[1.45rem] rounded-bl-md border border-primary/12 bg-[linear-gradient(180deg,hsl(var(--card)/0.94),hsl(var(--secondary)/0.55))] shadow-[0_14px_36px_hsl(var(--background)/0.16)]">
          <div className="flex items-center gap-2 px-3.5 py-2.5 thinking-shimmer">
            <div className="flex items-center gap-1.5">
              <span className="flex gap-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-pulse" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-pulse" style={{ animationDelay: '200ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-pulse" style={{ animationDelay: '400ms' }} />
              </span>
            </div>
            <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-primary/80">Running Analysis</span>
            {elapsed > 0 && (
              <span className="text-[10px] text-muted-foreground/50 ml-auto tabular-nums">{elapsed}s</span>
            )}
          </div>

          <div className="space-y-1.5 px-3.5 py-3 bg-background/18">
            {THINKING_STEPS.map((step, i) => {
              const isActive = i === stepIndex;
              const isPast = i < stepIndex;
              return (
                <div
                  key={step}
                  className="flex items-center gap-2 rounded-xl px-2 py-1.5 transition-all duration-300"
                  style={{ opacity: isPast ? 0.4 : isActive ? 1 : 0.25 }}
                >
                  <div className={`w-1 h-1 rounded-full transition-all duration-300 ${
                    isActive ? 'bg-primary scale-125' : isPast ? 'bg-primary/40' : 'bg-muted-foreground/20'
                  }`} />
                  <span className={`text-xs transition-colors duration-300 ${
                    isActive ? 'text-foreground/82' : 'text-muted-foreground/60'
                  }`}>
                    {step}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

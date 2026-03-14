'use client';

import { useState, useEffect } from 'react';
import { NexusIcon } from './nexus-icon';

const THINKING_STEPS = [
  'Understanding your request…',
  'Analyzing relevant data…',
  'Formulating response…',
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
      {/* AI icon with pulse ring */}
      <div className="shrink-0 w-7 h-7 rounded-full bg-gradient-to-br from-violet-500/20 to-blue-500/20 
        border border-primary/20 flex items-center justify-center mt-0.5 pulse-ring">
        <NexusIcon size={16} thinking active className="text-primary" />
      </div>

      {/* Thinking card */}
      <div className="flex-1 max-w-[85%] thinking-container">
        <div className="rounded-2xl rounded-bl-md border border-border/40 overflow-hidden">
          {/* Header bar with shimmer */}
          <div className="flex items-center gap-2 px-3.5 py-2.5 bg-secondary/40 thinking-shimmer">
            <div className="flex items-center gap-1.5">
              {/* Animated dots */}
              <span className="flex gap-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-pulse" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-pulse" style={{ animationDelay: '200ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-pulse" style={{ animationDelay: '400ms' }} />
              </span>
            </div>
            <span className="text-xs font-medium text-primary/80">Thinking</span>
            {elapsed > 0 && (
              <span className="text-[10px] text-muted-foreground/50 ml-auto tabular-nums">{elapsed}s</span>
            )}
          </div>

          {/* Steps list */}
          <div className="px-3.5 py-2 space-y-1.5 bg-secondary/20">
            {THINKING_STEPS.map((step, i) => {
              const isActive = i === stepIndex;
              const isPast = i < stepIndex;
              return (
                <div
                  key={step}
                  className="flex items-center gap-2 transition-all duration-300"
                  style={{ opacity: isPast ? 0.4 : isActive ? 1 : 0.25 }}
                >
                  {/* Step indicator */}
                  <div className={`w-1 h-1 rounded-full transition-all duration-300 ${
                    isActive ? 'bg-primary scale-125' : isPast ? 'bg-primary/40' : 'bg-muted-foreground/20'
                  }`} />
                  <span className={`text-xs transition-colors duration-300 ${
                    isActive ? 'text-foreground/80' : 'text-muted-foreground/60'
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

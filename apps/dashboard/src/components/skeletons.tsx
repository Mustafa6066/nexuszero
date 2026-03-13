'use client';

import { cn } from '@/lib/utils';

const CHART_BAR_HEIGHTS = ['38%', '64%', '52%', '81%', '47%', '69%', '56%', '74%'];

/** Shimmer skeleton — more polished than bare animate-pulse */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-lg bg-secondary/50',
        'before:absolute before:inset-0 before:-translate-x-full before:animate-shimmer',
        'before:bg-gradient-to-r before:from-transparent before:via-white/5 before:to-transparent',
        className,
      )}
      {...props}
    />
  );
}

/** Metric card skeleton */
export function MetricCardSkeleton() {
  return (
    <div className="rounded-2xl border border-border/40 bg-card/60 p-5 space-y-3">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-7 w-16" />
      <Skeleton className="h-2 w-32" />
    </div>
  );
}

/** Chart card skeleton */
export function ChartCardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('rounded-2xl border border-border/40 bg-card/60 p-5', className)}>
      <Skeleton className="h-3 w-32 mb-4" />
      <div className="flex items-end gap-1.5 h-32">
        {CHART_BAR_HEIGHTS.map((height, i) => (
          <Skeleton
            key={i}
            className="flex-1 rounded-t-md"
            style={{ height }}
          />
        ))}
      </div>
    </div>
  );
}

/** Table row skeleton */
export function TableRowSkeleton({ cols = 4 }: { cols?: number }) {
  return (
    <div className="flex items-center gap-4 py-3 px-4 border-b border-border/20">
      {Array.from({ length: cols }).map((_, i) => (
        <Skeleton key={i} className={cn('h-3', i === 0 ? 'w-32' : 'w-20')} />
      ))}
    </div>
  );
}

/** Full page skeleton for dashboard overview */
export function DashboardSkeleton() {
  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="space-y-2">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-3 w-64" />
      </div>
      {/* Metric cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <MetricCardSkeleton key={i} />
        ))}
      </div>
      {/* Charts */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCardSkeleton />
        <ChartCardSkeleton />
      </div>
    </div>
  );
}

/** Page-level skeleton for data-heavy pages */
export function PageSkeleton({ title, cards = 3 }: { title?: string; cards?: number }) {
  return (
    <div className="space-y-6 animate-fade-in">
      {title && (
        <div>
          <h1 className="text-2xl font-bold">{title}</h1>
          <Skeleton className="h-3 w-48 mt-2" />
        </div>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <MetricCardSkeleton key={i} />
        ))}
      </div>
      <div className="space-y-3">
        {Array.from({ length: cards }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-border/40 bg-card/60 p-5 space-y-3">
            <div className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 rounded-xl" />
              <div className="space-y-1.5 flex-1">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-3 w-1/4" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

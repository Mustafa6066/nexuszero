import { cn } from '@/lib/utils';

interface CardProps {
  children: React.ReactNode;
  className?: string;
}

export function Card({ children, className }: CardProps) {
  return (
    <div className={cn('rounded-xl border border-border bg-card p-6', className)}>
      {children}
    </div>
  );
}

interface MetricCardProps {
  title: string;
  value: string;
  change?: string;
  changeType?: 'positive' | 'negative' | 'neutral';
  icon?: React.ReactNode;
}

export function MetricCard({ title, value, change, changeType = 'neutral', icon }: MetricCardProps) {
  return (
    <Card>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className="mt-1 text-2xl font-bold">{value}</p>
          {change && (
            <p className={cn('mt-1 text-xs font-medium', {
              'text-green-400': changeType === 'positive',
              'text-red-400': changeType === 'negative',
              'text-muted-foreground': changeType === 'neutral',
            })}>
              {change}
            </p>
          )}
        </div>
        {icon && <div className="rounded-lg bg-primary/10 p-2.5">{icon}</div>}
      </div>
    </Card>
  );
}

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'destructive' | 'outline';
}

export function Badge({ children, variant = 'default' }: BadgeProps) {
  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', {
      'bg-primary/10 text-primary': variant === 'default',
      'bg-green-500/10 text-green-400': variant === 'success',
      'bg-yellow-500/10 text-yellow-400': variant === 'warning',
      'bg-red-500/10 text-red-400': variant === 'destructive',
      'border border-border text-muted-foreground': variant === 'outline',
    })}>
      {children}
    </span>
  );
}

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive';
  size?: 'sm' | 'md' | 'lg';
}

export function Button({ variant = 'primary', size = 'md', className, ...props }: ButtonProps) {
  return (
    <button
      className={cn('inline-flex items-center justify-center rounded-lg font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring disabled:pointer-events-none disabled:opacity-50', {
        'bg-primary text-primary-foreground hover:bg-primary/90': variant === 'primary',
        'bg-secondary text-secondary-foreground hover:bg-secondary/80': variant === 'secondary',
        'border border-border bg-transparent hover:bg-secondary': variant === 'outline',
        'bg-transparent hover:bg-secondary': variant === 'ghost',
        'bg-destructive text-destructive-foreground hover:bg-destructive/90': variant === 'destructive',
        'h-8 px-3 text-xs': size === 'sm',
        'h-10 px-4 text-sm': size === 'md',
        'h-12 px-6 text-base': size === 'lg',
      }, className)}
      {...props}
    />
  );
}

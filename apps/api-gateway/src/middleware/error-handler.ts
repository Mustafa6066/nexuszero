import type { Context } from 'hono';
import { AppError, captureException, CircuitBreakerOpenError } from '@nexuszero/shared';

/** Type-guard that works even when instanceof fails due to duplicate module copies */
function isAppError(err: unknown): err is AppError {
  if (err instanceof AppError) return true;
  if (err && typeof err === 'object' && (err as any).name === 'AppError' && typeof (err as any).status === 'number') return true;
  return false;
}

function isCircuitBreakerOpen(err: unknown): boolean {
  if (err instanceof CircuitBreakerOpenError) return true;
  if (err && typeof err === 'object' && (err as any).name === 'CircuitBreakerOpenError') return true;
  return false;
}

export const errorHandler = (err: Error, c: Context) => {
  if (isCircuitBreakerOpen(err)) {
    c.header('Retry-After', '30');
    return c.json({
      error: {
        code: 'SERVICE_UNAVAILABLE',
        message: 'Service temporarily unavailable — circuit breaker open',
      },
    }, 503);
  }

  if (isAppError(err)) {
    return c.json({
      error: {
        code: err.code,
        message: err.message,
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
      },
    }, err.status as Parameters<typeof c.json>[1]);
  }

  console.error('Unhandled error:', err);
  captureException(err);

  return c.json({
    error: {
      code: 'INTERNAL_ERROR',
      message: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    },
  }, 500);
};

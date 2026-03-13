import type { Context } from 'hono';
import { AppError } from '@nexuszero/shared';

/** Type-guard that works even when instanceof fails due to duplicate module copies */
function isAppError(err: unknown): err is AppError {
  if (err instanceof AppError) return true;
  if (err && typeof err === 'object' && (err as any).name === 'AppError' && typeof (err as any).status === 'number') return true;
  return false;
}

export const errorHandler = (err: Error, c: Context) => {
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

  return c.json({
    error: {
      code: 'INTERNAL_ERROR',
      message: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    },
  }, 500);
};

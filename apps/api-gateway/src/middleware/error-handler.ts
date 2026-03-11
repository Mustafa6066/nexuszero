import type { Context } from 'hono';
import { AppError } from '@nexuszero/shared';

export const errorHandler = (err: Error, c: Context) => {
  if (err instanceof AppError) {
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

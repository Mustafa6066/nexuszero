import * as Sentry from '@sentry/node';
import { redactPii } from './pii-sanitizer.js';

let initialized = false;

/**
 * Initialize Sentry error tracking for a backend service.
 * Call once at startup, before any request handling.
 *
 * Uses PII sanitizer as a `beforeSend` hook to strip sensitive data
 * from error reports before they leave the process.
 */
export function initSentry(serviceName: string): void {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn || initialized) return;

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
    release: process.env.APP_VERSION ?? '0.0.0',
    serverName: serviceName,
    tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE ?? '0.1'),
    beforeSend(event) {
      // Strip PII from error messages
      if (event.message) {
        const result = redactPii(event.message);
        event.message = result.redactedContent;
      }

      // Strip PII from exception values
      if (event.exception?.values) {
        for (const ex of event.exception.values) {
          if (ex.value) {
            const result = redactPii(ex.value);
            ex.value = result.redactedContent;
          }
        }
      }

      // Strip sensitive headers/cookies from request data
      if (event.request) {
        delete event.request.cookies;
        if (event.request.headers) {
          delete event.request.headers['authorization'];
          delete event.request.headers['cookie'];
          delete event.request.headers['x-api-key'];
        }
      }

      // Tag with tenant context if available
      if (event.extra?.tenantId) {
        event.tags = { ...event.tags, tenantId: String(event.extra.tenantId) };
      }

      return event;
    },
  });

  Sentry.setTag('service', serviceName);
  initialized = true;
}

/**
 * Capture an exception in Sentry with optional tenant context.
 */
export function captureException(error: unknown, context?: { tenantId?: string; extra?: Record<string, unknown> }): void {
  if (!initialized) return;

  Sentry.withScope((scope) => {
    if (context?.tenantId) {
      scope.setTag('tenantId', context.tenantId);
    }
    if (context?.extra) {
      for (const [key, value] of Object.entries(context.extra)) {
        scope.setExtra(key, value);
      }
    }
    Sentry.captureException(error);
  });
}

/**
 * Flush pending Sentry events before shutdown.
 */
export async function flushSentry(timeoutMs = 2000): Promise<void> {
  if (!initialized) return;
  await Sentry.flush(timeoutMs);
}

// Re-export Sentry for direct access when needed
export { Sentry };

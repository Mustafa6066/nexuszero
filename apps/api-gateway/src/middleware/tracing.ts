import type { Context, Next } from 'hono';
import { extractTraceContext, spanKindForServer, withSpan } from '@nexuszero/shared';

function headersToCarrier(c: Context): Record<string, string> {
  const carrier: Record<string, string> = {};
  c.req.raw.headers.forEach((value, key) => {
    carrier[key] = value;
  });
  return carrier;
}

export async function tracingMiddleware(c: Context, next: Next) {
  await withSpan('http.request', {
    tracerName: 'nexuszero.api-gateway',
    parentContext: extractTraceContext(headersToCarrier(c)),
    kind: spanKindForServer(),
    attributes: {
      'http.request.method': c.req.method,
      'url.path': c.req.path,
      'url.full': c.req.url,
    },
  }, async (span) => {
    await next();

    const tenantId = c.get('tenantId');
    if (tenantId) {
      span.setAttribute('nexuszero.tenant.id', tenantId);
    }

    span.setAttribute('http.response.status_code', c.res.status);
  });
}
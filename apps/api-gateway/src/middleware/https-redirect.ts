import type { Context, Next } from 'hono';

/**
 * Middleware that enforces HTTPS by redirecting plain-HTTP requests.
 *
 * In production (or any Railway-hosted environment) incoming requests arrive
 * via a TLS-terminating reverse proxy.  The proxy forwards the original scheme
 * in the `X-Forwarded-Proto` header, so we check that header rather than the
 * raw socket protocol.
 *
 * Health-check requests are intentionally exempted so load-balancer probes
 * that arrive over HTTP still receive a 200 OK.
 */
export async function httpsRedirectMiddleware(c: Context, next: Next) {
  // Skip in local development so the dev server still works over plain HTTP.
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  if (nodeEnv === 'development' || nodeEnv === 'test') {
    return next();
  }

  // Allow health-check probes (load balancers / Railway) to pass through.
  if (c.req.path === '/health') {
    return next();
  }

  const proto = c.req.header('x-forwarded-proto');

  // Only redirect plain HTTP — leave HTTPS, WebSocket, or absent headers alone.
  if (proto !== 'http') {
    return next();
  }

  // Redirect HTTP → HTTPS (permanent).
  const url = new URL(c.req.url);
  url.protocol = 'https:';
  return c.redirect(url.toString(), 301);
}

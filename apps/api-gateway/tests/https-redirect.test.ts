import { describe, it, expect, afterEach } from 'vitest';
import { Hono } from 'hono';
import { httpsRedirectMiddleware } from '../src/middleware/https-redirect.js';

function createTestApp() {
  const app = new Hono();
  app.use('*', httpsRedirectMiddleware);
  app.get('/health', (c) => c.json({ status: 'ok' }));
  app.get('/api/test', (c) => c.json({ ok: true }));
  return app;
}

describe('httpsRedirectMiddleware', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('passes through in development mode', async () => {
    process.env.NODE_ENV = 'development';
    const app = createTestApp();
    const res = await app.request('http://example.com/api/test', {
      headers: { 'x-forwarded-proto': 'http' },
    });
    expect(res.status).toBe(200);
  });

  it('passes through in test mode', async () => {
    process.env.NODE_ENV = 'test';
    const app = createTestApp();
    const res = await app.request('http://example.com/api/test', {
      headers: { 'x-forwarded-proto': 'http' },
    });
    expect(res.status).toBe(200);
  });

  it('redirects HTTP to HTTPS in production', async () => {
    process.env.NODE_ENV = 'production';
    const app = createTestApp();
    const res = await app.request('http://example.com/api/test', {
      headers: { 'x-forwarded-proto': 'http' },
    });
    expect(res.status).toBe(301);
    expect(res.headers.get('location')).toBe('https://example.com/api/test');
  });

  it('passes through HTTPS requests in production', async () => {
    process.env.NODE_ENV = 'production';
    const app = createTestApp();
    const res = await app.request('https://example.com/api/test', {
      headers: { 'x-forwarded-proto': 'https' },
    });
    expect(res.status).toBe(200);
  });

  it('passes through health check even over HTTP in production', async () => {
    process.env.NODE_ENV = 'production';
    const app = createTestApp();
    const res = await app.request('http://example.com/health', {
      headers: { 'x-forwarded-proto': 'http' },
    });
    expect(res.status).toBe(200);
  });

  it('passes through when x-forwarded-proto header is absent', async () => {
    process.env.NODE_ENV = 'production';
    const app = createTestApp();
    const res = await app.request('http://example.com/api/test');
    expect(res.status).toBe(200);
  });
});

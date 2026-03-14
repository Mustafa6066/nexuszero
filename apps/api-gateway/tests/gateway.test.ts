import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { AppError, ERROR_CODES } from '@nexuszero/shared';

// Isolated test app that mirrors gateway structure without real DB/Redis
function createTestApp() {
  const app = new Hono();

  app.onError((err, c) => {
    if (err instanceof AppError) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status as any);
    }
    return c.json({ error: { code: 'INTERNAL_ERROR', message: err.message } }, 500);
  });

  app.get('/health', (c) =>
    c.json({ status: 'ok', service: 'api-gateway', timestamp: new Date().toISOString() }),
  );

  app.get('/api/v1/protected', (c) => {
    const authHeader = c.req.header('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      throw new AppError('AUTH_REQUIRED', undefined, 'Missing authentication');
    }
    return c.json({ ok: true });
  });

  app.post('/api/v1/echo', async (c) => {
    const body = await c.req.json();
    return c.json(body);
  });

  return app;
}

describe('API Gateway — health check', () => {
  let app: Hono;

  beforeEach(() => {
    app = createTestApp();
  });

  it('GET /health returns 200', async () => {
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe('ok');
    expect(data.service).toBe('api-gateway');
    expect(data.timestamp).toBeDefined();
  });
});

describe('API Gateway — error handling', () => {
  let app: Hono;

  beforeEach(() => {
    app = createTestApp();
  });

  it('returns 401 for missing auth', async () => {
    const res = await app.request('/api/v1/protected');
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error.code).toBe(ERROR_CODES.AUTH_REQUIRED.code);
  });

  it('returns 200 with valid Bearer header', async () => {
    const res = await app.request('/api/v1/protected', {
      headers: { Authorization: 'Bearer fake-test-token' },
    });
    expect(res.status).toBe(200);
  });
});

describe('API Gateway — request parsing', () => {
  let app: Hono;

  beforeEach(() => {
    app = createTestApp();
  });

  it('echoes JSON body', async () => {
    const body = { name: 'test', value: 42 };
    const res = await app.request('/api/v1/echo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual(body);
  });
});

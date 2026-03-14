import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { getCurrentTenantId } from '@nexuszero/shared';
import { tenantMiddleware } from '../src/middleware/tenant.js';

describe('tenant middleware isolation', () => {
  it('derives tenant context from the authenticated user instead of request headers', async () => {
    const app = new Hono();

    app.use('*', async (c, next) => {
      c.set('user', { userId: 'user-1', tenantId: 'tenant-authenticated' });
      await next();
    });

    app.use('*', tenantMiddleware);

    app.get('/tenant-check', (c) => c.json({
      tenantId: c.get('tenantId'),
      contextTenantId: getCurrentTenantId(),
      headerTenantId: c.req.header('X-Tenant-ID') ?? null,
    }));

    const response = await app.request('/tenant-check', {
      headers: { 'X-Tenant-ID': 'tenant-spoofed' },
    });
    const body = await response.json();

    expect(body.tenantId).toBe('tenant-authenticated');
    expect(body.contextTenantId).toBe('tenant-authenticated');
    expect(body.headerTenantId).toBe('tenant-spoofed');
  });
});
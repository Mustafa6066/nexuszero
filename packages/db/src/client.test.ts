import { describe, expect, it, vi } from 'vitest';

const { drizzleMock } = vi.hoisted(() => ({
  drizzleMock: vi.fn(() => ({ scoped: true })),
}));

vi.mock('drizzle-orm/postgres-js', () => ({
  drizzle: drizzleMock,
}));

import { applyTenantSession } from './client';

describe('applyTenantSession', () => {
  it('sets the tenant session variable and local role before running the callback', async () => {
    const transaction = Object.assign(
      vi.fn(async () => undefined),
      { unsafe: vi.fn(async () => undefined) },
    );
    const callback = vi.fn(async () => 'ok');

    const result = await applyTenantSession(transaction as any, 'tenant-a', callback, {
      appRole: 'nexuszero_app',
      enforceRls: true,
    });

    expect(result).toBe('ok');
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(String(transaction.mock.calls[0][0]?.[0] ?? '')).toContain("set_config('app.current_tenant_id'");
    expect(transaction.mock.calls[0][1]).toBe('tenant-a');
    expect(transaction.unsafe).toHaveBeenCalledWith('set local role "nexuszero_app"');
    expect(callback).toHaveBeenCalledWith({ scoped: true });
  });
});
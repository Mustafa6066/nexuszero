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
      vi.fn(async (strings: TemplateStringsArray) => {
        const query = String(strings?.[0] ?? '');
        if (query.includes('from pg_roles')) {
          return [{ roleExists: true }];
        }

        return undefined;
      }),
      { unsafe: vi.fn(async () => undefined) },
    );
    const callback = vi.fn(async () => 'ok');

    const result = await applyTenantSession(transaction as any, 'tenant-a', callback, {
      appRole: 'nexuszero_app_existing',
      enforceRls: true,
    });

    expect(result).toBe('ok');
    expect(transaction).toHaveBeenCalledTimes(2);
    expect(String(transaction.mock.calls[0][0]?.[0] ?? '')).toContain("set_config('app.current_tenant_id'");
    expect(transaction.mock.calls[0][1]).toBe('tenant-a');
    expect(String(transaction.mock.calls[1][0]?.[0] ?? '')).toContain('from pg_roles');
    expect(transaction.mock.calls[1][1]).toBe('nexuszero_app_existing');
    expect(transaction.unsafe).toHaveBeenCalledWith('set local role "nexuszero_app_existing"');
    expect(callback).toHaveBeenCalledWith({ scoped: true });
  });

  it('skips local role enforcement when no app role is configured', async () => {
    const transaction = Object.assign(
      vi.fn(async () => undefined),
      { unsafe: vi.fn(async () => undefined) },
    );
    const callback = vi.fn(async () => 'ok');

    const result = await applyTenantSession(transaction as any, 'tenant-a', callback, {
      enforceRls: true,
    });

    expect(result).toBe('ok');
    expect(transaction.unsafe).not.toHaveBeenCalled();
    expect(callback).toHaveBeenCalledWith({ scoped: true });
  });

  it('skips local role enforcement when the configured role does not exist', async () => {
    const transaction = Object.assign(
      vi.fn(async (strings: TemplateStringsArray) => {
        const query = String(strings?.[0] ?? '');
        if (query.includes('from pg_roles')) {
          return [{ roleExists: false }];
        }

        return undefined;
      }),
      { unsafe: vi.fn(async () => undefined) },
    );
    const callback = vi.fn(async () => 'ok');

    const result = await applyTenantSession(transaction as any, 'tenant-a', callback, {
      appRole: 'nexuszero_app_missing',
      enforceRls: true,
    });

    expect(result).toBe('ok');
    expect(transaction.unsafe).not.toHaveBeenCalled();
    expect(callback).toHaveBeenCalledWith({ scoped: true });
  });
});
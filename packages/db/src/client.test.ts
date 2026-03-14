import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { dbMock, dbTransactionMock, drizzleMock, postgresClientMock, postgresFactoryMock } = vi.hoisted(() => {
  const dbTransactionMock = vi.fn();
  const dbMock = {
    transaction: dbTransactionMock,
  };
  const postgresClientMock = {
    begin: vi.fn(),
    end: vi.fn(async () => undefined),
  };

  return {
    dbMock,
    dbTransactionMock,
    drizzleMock: vi.fn(() => dbMock),
    postgresClientMock,
    postgresFactoryMock: vi.fn(() => postgresClientMock),
  };
});

vi.mock('drizzle-orm/postgres-js', () => ({
  drizzle: drizzleMock,
}));

vi.mock('postgres', () => ({
  default: postgresFactoryMock,
}));

import { applyTenantSession, closeDb, executeWithTenantSession } from './client';

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(async () => {
  await closeDb();
  delete process.env.DATABASE_URL;
});

describe('applyTenantSession', () => {
  it('sets the tenant session variable and local role before running the callback', async () => {
    const transaction = {
      execute: vi.fn()
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce([{ roleExists: true }])
        .mockResolvedValueOnce(undefined),
    };
    const callback = vi.fn(async () => 'ok');

    const result = await applyTenantSession(transaction as any, 'tenant-a', callback, {
      appRole: 'nexuszero_app_existing',
      enforceRls: true,
    });

    expect(result).toBe('ok');
    expect(transaction.execute).toHaveBeenCalledTimes(3);
    expect(callback).toHaveBeenCalledWith(transaction);
    expect(drizzleMock).not.toHaveBeenCalled();
  });

  it('skips local role enforcement when no app role is configured', async () => {
    const transaction = {
      execute: vi.fn().mockResolvedValue(undefined),
    };
    const callback = vi.fn(async () => 'ok');

    const result = await applyTenantSession(transaction as any, 'tenant-a', callback, {
      enforceRls: true,
    });

    expect(result).toBe('ok');
    expect(transaction.execute).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(transaction);
    expect(drizzleMock).not.toHaveBeenCalled();
  });

  it('skips local role enforcement when the configured role does not exist', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const transaction = {
      execute: vi.fn()
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce([{ roleExists: false }]),
    };
    const callback = vi.fn(async () => 'ok');

    const result = await applyTenantSession(transaction as any, 'tenant-a', callback, {
      appRole: 'nexuszero_app_missing',
      enforceRls: true,
    });

    expect(result).toBe('ok');
    expect(transaction.execute).toHaveBeenCalledTimes(2);
    expect(callback).toHaveBeenCalledWith(transaction);
    expect(drizzleMock).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

describe('executeWithTenantSession', () => {
  it('uses a Drizzle transaction instead of the raw postgres begin API', async () => {
    const transaction = {
      execute: vi.fn().mockResolvedValue(undefined),
    };
    const callback = vi.fn(async () => 'ok');

    process.env.DATABASE_URL = 'postgres://test:test@localhost:5432/test';
    dbTransactionMock.mockImplementationOnce(async (handler) => handler(transaction));

    const result = await executeWithTenantSession('tenant-a', callback);

    expect(result).toBe('ok');
    expect(postgresFactoryMock).toHaveBeenCalledTimes(1);
    expect(dbTransactionMock).toHaveBeenCalledTimes(1);
    expect(postgresClientMock.begin).not.toHaveBeenCalled();
    expect(callback).toHaveBeenCalledWith(transaction);
  });
});

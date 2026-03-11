import { AsyncLocalStorage } from 'node:async_hooks';

export interface TenantContext {
  tenantId: string;
  plan: string;
  requestId: string;
}

/**
 * AsyncLocalStorage-based tenant context propagation.
 * Ensures every DB query, Redis operation, and log entry
 * automatically includes tenantId without explicit passing.
 * Prevents cross-tenant data leakage in shared services.
 */
const tenantStore = new AsyncLocalStorage<TenantContext>();

/** Run a function within a tenant context */
export function runWithTenantContext<T>(ctx: TenantContext, fn: () => T): T {
  return tenantStore.run(ctx, fn);
}

/** Run an async function within a tenant context */
export function runWithTenantContextAsync<T>(ctx: TenantContext, fn: () => Promise<T>): Promise<T> {
  return tenantStore.run(ctx, fn);
}

/** Get the current tenant context. Throws if not in a tenant context */
export function getTenantContext(): TenantContext {
  const ctx = tenantStore.getStore();
  if (!ctx) {
    throw new Error('No tenant context available. Ensure this code runs within runWithTenantContext.');
  }
  return ctx;
}

/** Get the current tenant context, or null if not set */
export function getTenantContextOptional(): TenantContext | null {
  return tenantStore.getStore() ?? null;
}

/** Get current tenant ID. Throws if not in context */
export function getCurrentTenantId(): string {
  return getTenantContext().tenantId;
}

/** Get current request ID. Throws if not in context */
export function getCurrentRequestId(): string {
  return getTenantContext().requestId;
}

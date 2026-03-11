import type { Context, Next } from 'hono';
import { runWithTenantContext, AppError } from '@nexuszero/shared';

declare module 'hono' {
  interface ContextVariableMap {
    tenantId: string;
  }
}

export const tenantMiddleware = async (c: Context, next: Next) => {
  const user = c.get('user');
  if (!user?.tenantId) {
    throw new AppError('TENANT_NOT_FOUND');
  }

  c.set('tenantId', user.tenantId);

  // Run the rest of the request within tenant context (AsyncLocalStorage)
  return runWithTenantContext(
    {
      tenantId: user.tenantId,
      requestId: crypto.randomUUID(),
    },
    () => next(),
  );
};

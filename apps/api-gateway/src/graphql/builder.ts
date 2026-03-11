import SchemaBuilder from '@pothos/core';
import ScopeAuthPlugin from '@pothos/plugin-scope-auth';
import ValidationPlugin from '@pothos/plugin-validation';
import type { AuthUser } from '../middleware/auth.js';

export interface PothosContext {
  user?: AuthUser;
  tenantId?: string;
}

export const builder = new SchemaBuilder<{
  Context: PothosContext;
  AuthScopes: {
    authenticated: boolean;
    admin: boolean;
    owner: boolean;
  };
  Scalars: {
    DateTime: { Input: Date; Output: Date };
    JSON: { Input: any; Output: any };
  };
}>({
  plugins: [ScopeAuthPlugin, ValidationPlugin],
  authScopes: async (context) => ({
    authenticated: !!context.user,
    admin: context.user?.role === 'admin' || context.user?.role === 'owner',
    owner: context.user?.role === 'owner',
  }),
});

// Scalar types
builder.scalarType('DateTime', {
  serialize: (value) => value.toISOString(),
  parseValue: (value) => new Date(value as string),
});

builder.scalarType('JSON', {
  serialize: (value) => value,
  parseValue: (value) => value,
});

builder.queryType({});
builder.mutationType({});

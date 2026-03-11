import { builder } from '../builder.js';
import { withTenantDb, tenants, users } from '@nexuszero/db';
import { eq } from 'drizzle-orm';

const TenantType = builder.objectRef<any>('Tenant').implement({
  fields: (t) => ({
    id: t.exposeString('id'),
    slug: t.exposeString('slug'),
    name: t.exposeString('name'),
    domain: t.exposeString('domain', { nullable: true }),
    plan: t.exposeString('plan'),
    status: t.exposeString('status'),
    onboardingState: t.exposeString('onboardingState'),
    settings: t.expose('settings', { type: 'JSON', nullable: true }),
    createdAt: t.expose('createdAt', { type: 'DateTime' }),
    updatedAt: t.expose('updatedAt', { type: 'DateTime' }),
  }),
});

const UserType = builder.objectRef<any>('User').implement({
  fields: (t) => ({
    id: t.exposeString('id'),
    email: t.exposeString('email'),
    name: t.exposeString('name'),
    role: t.exposeString('role'),
    lastLoginAt: t.expose('lastLoginAt', { type: 'DateTime', nullable: true }),
    createdAt: t.expose('createdAt', { type: 'DateTime' }),
  }),
});

builder.queryField('currentTenant', (t) =>
  t.field({
    type: TenantType,
    authScopes: { authenticated: true },
    resolve: async (_root, _args, ctx) => {
      return withTenantDb(ctx.tenantId!, async (db) => {
        const [tenant] = await db.select().from(tenants).where(eq(tenants.id, ctx.tenantId!)).limit(1);
        return tenant;
      });
    },
  }),
);

builder.queryField('users', (t) =>
  t.field({
    type: [UserType],
    authScopes: { authenticated: true },
    resolve: async (_root, _args, ctx) => {
      return withTenantDb(ctx.tenantId!, async (db) => {
        return db.select().from(users).where(eq(users.tenantId, ctx.tenantId!));
      });
    },
  }),
);

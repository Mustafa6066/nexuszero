import { builder } from '../builder.js';
import { withTenantDb, campaigns } from '@nexuszero/db';
import { eq, and, sql } from 'drizzle-orm';

const CampaignType = builder.objectRef<any>('Campaign').implement({
  fields: (t) => ({
    id: t.exposeString('id'),
    name: t.exposeString('name'),
    type: t.exposeString('type'),
    status: t.exposeString('status'),
    platform: t.exposeString('platform'),
    budget: t.expose('budget', { type: 'JSON', nullable: true }),
    targeting: t.expose('targeting', { type: 'JSON', nullable: true }),
    schedule: t.expose('schedule', { type: 'JSON', nullable: true }),
    config: t.expose('config', { type: 'JSON', nullable: true }),
    impressions: t.exposeInt('impressions'),
    clicks: t.exposeInt('clicks'),
    conversions: t.exposeInt('conversions'),
    spend: t.exposeFloat('spend'),
    revenue: t.exposeFloat('revenue'),
    ctr: t.exposeFloat('ctr'),
    roas: t.exposeFloat('roas'),
    createdAt: t.expose('createdAt', { type: 'DateTime' }),
    updatedAt: t.expose('updatedAt', { type: 'DateTime' }),
  }),
});

builder.queryField('campaigns', (t) =>
  t.field({
    type: [CampaignType],
    authScopes: { authenticated: true },
    args: {
      status: t.arg.string({ required: false }),
      type: t.arg.string({ required: false }),
      limit: t.arg.int({ required: false }),
    },
    resolve: async (_root, args, ctx) => {
      return withTenantDb(ctx.tenantId!, async (db) => {
        const conditions = [eq(campaigns.tenantId, ctx.tenantId!)];
        if (args.status) conditions.push(eq(campaigns.status, args.status as any));
        if (args.type) conditions.push(eq(campaigns.type, args.type as any));

        return db.select().from(campaigns)
          .where(and(...conditions))
          .limit(args.limit || 50)
          .orderBy(campaigns.createdAt);
      });
    },
  }),
);

builder.queryField('campaign', (t) =>
  t.field({
    type: CampaignType,
    nullable: true,
    authScopes: { authenticated: true },
    args: { id: t.arg.string({ required: true }) },
    resolve: async (_root, args, ctx) => {
      return withTenantDb(ctx.tenantId!, async (db) => {
        const [campaign] = await db.select().from(campaigns)
          .where(and(eq(campaigns.id, args.id), eq(campaigns.tenantId, ctx.tenantId!)))
          .limit(1);
        return campaign || null;
      });
    },
  }),
);

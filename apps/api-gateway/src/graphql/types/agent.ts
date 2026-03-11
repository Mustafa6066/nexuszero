import { builder } from '../builder.js';
import { withTenantDb, agents, agentTasks } from '@nexuszero/db';
import { eq, and, desc, sql } from 'drizzle-orm';

const AgentType = builder.objectRef<any>('Agent').implement({
  fields: (t) => ({
    id: t.exposeString('id'),
    type: t.exposeString('type'),
    status: t.exposeString('status'),
    tasksCompleted: t.exposeInt('tasksCompleted'),
    tasksFailed: t.exposeInt('tasksFailed'),
    avgProcessingTimeMs: t.exposeFloat('avgProcessingTimeMs', { nullable: true }),
    lastHeartbeat: t.expose('lastHeartbeat', { type: 'DateTime', nullable: true }),
    metadata: t.expose('metadata', { type: 'JSON', nullable: true }),
    createdAt: t.expose('createdAt', { type: 'DateTime' }),
  }),
});

const AgentTaskType = builder.objectRef<any>('AgentTask').implement({
  fields: (t) => ({
    id: t.exposeString('id'),
    type: t.exposeString('type'),
    priority: t.exposeString('priority'),
    status: t.exposeString('status'),
    input: t.expose('input', { type: 'JSON', nullable: true }),
    output: t.expose('output', { type: 'JSON', nullable: true }),
    error: t.exposeString('error', { nullable: true }),
    attempts: t.exposeInt('attempts'),
    processingTimeMs: t.exposeInt('processingTimeMs', { nullable: true }),
    createdAt: t.expose('createdAt', { type: 'DateTime' }),
    completedAt: t.expose('completedAt', { type: 'DateTime', nullable: true }),
  }),
});

builder.queryField('agents', (t) =>
  t.field({
    type: [AgentType],
    authScopes: { authenticated: true },
    resolve: async (_root, _args, ctx) => {
      return withTenantDb(ctx.tenantId!, async (db) => {
        return db.select().from(agents).where(eq(agents.tenantId, ctx.tenantId!));
      });
    },
  }),
);

builder.queryField('agentTasks', (t) =>
  t.field({
    type: [AgentTaskType],
    authScopes: { authenticated: true },
    args: {
      agentId: t.arg.string({ required: false }),
      status: t.arg.string({ required: false }),
      limit: t.arg.int({ required: false }),
    },
    resolve: async (_root, args, ctx) => {
      return withTenantDb(ctx.tenantId!, async (db) => {
        const conditions = [eq(agentTasks.tenantId, ctx.tenantId!)];
        if (args.agentId) conditions.push(eq(agentTasks.agentId, args.agentId));
        if (args.status) conditions.push(eq(agentTasks.status, args.status as any));

        return db.select().from(agentTasks)
          .where(and(...conditions))
          .orderBy(desc(agentTasks.createdAt))
          .limit(args.limit || 50);
      });
    },
  }),
);

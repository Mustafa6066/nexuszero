import { Hono } from 'hono';
import { getDb, compoundInsights } from '@nexuszero/db';
import { desc, sql } from 'drizzle-orm';

const app = new Hono();

// GET / — list active compound insights, ordered by confidence
app.get('/', async (c) => {
  const db = getDb();
  const now = new Date();

  const rows = await db
    .select()
    .from(compoundInsights)
    .where(
      sql`(${compoundInsights.effectiveUntil} IS NULL OR ${compoundInsights.effectiveUntil} > ${now})`,
    )
    .orderBy(desc(compoundInsights.confidence))
    .limit(20);

  return c.json(rows);
});

export const compoundInsightsRoutes = app;

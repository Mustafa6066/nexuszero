import { Hono } from 'hono';
import { withTenantDb, loginStreaks } from '@nexuszero/db';
import { AppError } from '@nexuszero/shared';
import { eq, and } from 'drizzle-orm';

const app = new Hono();

// GET /streaks/me — get current user's streak and rank
app.get('/me', async (c) => {
  const tenantId = c.get('tenantId');
  const user = c.get('user');

  return withTenantDb(tenantId, async (db) => {
    const [streak] = await db.select().from(loginStreaks)
      .where(and(eq(loginStreaks.userId, user.userId), eq(loginStreaks.tenantId, tenantId)))
      .limit(1);

    if (!streak) {
      return c.json({
        currentStreak: 0,
        longestStreak: 0,
        totalLogins: 0,
        rank: 'recruit',
        lastLoginDate: null,
      });
    }

    return c.json(streak);
  });
});

export { app as streakRoutes };

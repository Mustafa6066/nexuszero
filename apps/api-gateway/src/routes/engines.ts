/**
 * Engine Routes — Fleet engine deployment for EaaS.
 *
 * POST /engines/deploy — Deploy a NexusZero engine for a tenant
 * GET  /engines/status/:id — Check deployment status (future)
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { AppError } from '@nexuszero/shared';
import { deployEngine } from '../services/engine-deploy.service.js';

const VALID_AGENTS = ['seo', 'ad', 'creative', 'data_nexus', 'aeo', 'compatibility'] as const;
const VALID_TIERS = ['launchpad', 'growth', 'enterprise'] as const;

const deployInputSchema = z.object({
  websiteUrl: z.string().min(3, 'Website URL is required').max(2048),
  companyName: z.string().min(1, 'Company name is required').max(200),
  agents: z.array(z.enum(VALID_AGENTS)).min(1, 'At least one agent is required'),
  tier: z.enum(VALID_TIERS),
  platforms: z.array(z.string()).optional(),
  skipPreflight: z.boolean().optional().default(false),
});

const app = new Hono();

// POST /engines/deploy — Deploy a NexusZero engine
app.post('/deploy', async (c) => {
  const tenantId = c.get('tenantId');
  const body = await c.req.json().catch(() => null);
  if (!body) throw new AppError('VALIDATION_ERROR', { reason: 'Request body is required' });

  const parsed = deployInputSchema.safeParse(body);
  if (!parsed.success) {
    throw new AppError('VALIDATION_ERROR', {
      reason: parsed.error.issues.map((i) => i.message).join(', '),
    });
  }

  const result = await deployEngine(tenantId, parsed.data as any);
  return c.json(result);
});

export const engineRoutes = app;

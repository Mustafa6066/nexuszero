/**
 * Scanner Routes — Pre-flight website scanning for EaaS onboarding.
 *
 * POST /scanner/preflight   — Scan any domain (requires auth)
 * GET  /scanner/results/:id — Retrieve cached scan result (future)
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { AppError } from '@nexuszero/shared';
import { runPreflightScan } from '../services/preflight-scanner.service.js';

const preflightInputSchema = z.object({
  websiteUrl: z.string().min(3, 'URL is required').max(2048, 'URL too long'),
});

const app = new Hono();

// POST /scanner/preflight — Run a pre-flight scan on any website
app.post('/preflight', async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body) throw new AppError('VALIDATION_ERROR', { reason: 'Request body is required' });

  const parsed = preflightInputSchema.safeParse(body);
  if (!parsed.success) {
    throw new AppError('VALIDATION_ERROR', {
      reason: parsed.error.issues.map((i) => i.message).join(', '),
    });
  }

  const result = await runPreflightScan(parsed.data.websiteUrl);
  return c.json(result);
});

export const scannerRoutes = app;

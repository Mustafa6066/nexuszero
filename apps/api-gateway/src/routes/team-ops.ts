import { Hono } from 'hono';
import { withTenantDb, agentActions } from '@nexuszero/db';
import { AppError } from '@nexuszero/shared';
import { routedCompletion, ModelPreset } from '@nexuszero/llm-router';
import { z } from 'zod';

const app = new Hono();

const teamAuditSchema = z.object({
  teamMembers: z.array(z.object({
    name: z.string(),
    role: z.string(),
    metrics: z.record(z.number()).optional(),
    recentWork: z.array(z.string()).optional(),
    feedback: z.array(z.string()).optional(),
  })).min(1),
  period: z.string().optional(),
  goals: z.array(z.string()).optional(),
  benchmarks: z.record(z.number()).optional(),
});

const meetingSchema = z.object({
  transcript: z.string().min(50),
  meetingTitle: z.string().optional(),
  attendees: z.array(z.string()).optional(),
  meetingType: z.string().optional(),
  duration: z.number().optional(),
});

// POST /team-ops/audit — run team audit (Elon Algorithm)
app.post('/audit', async (c) => {
  const tenantId = c.get('tenantId');
  const body = await c.req.json().catch(() => ({}));
  const parsed = teamAuditSchema.safeParse(body);
  if (!parsed.success) throw new AppError('VALIDATION_ERROR', parsed.error.issues);

  const { teamMembers, period = 'quarterly', goals = [], benchmarks = {} } = parsed.data;

  const raw = await routedCompletion({
    model: ModelPreset.LONG_FORM,
    messages: [{ role: 'user', content: `Apply Elon Algorithm (Question→Delete→Simplify→Accelerate→Automate) team audit.\n\nTEAM: ${JSON.stringify(teamMembers)}\nPERIOD: ${period}\nGOALS: ${JSON.stringify(goals)}\nBENCHMARKS: ${JSON.stringify(benchmarks)}\n\nScore each member on: Output Velocity(30%), Quality(30%), Independence(20%), Initiative(20%). Classify A/B/C tier.\n\nReturn JSON with: assessments[], elonAlgorithm{question,delete,simplify,accelerate,automate}, teamHealth{overallScore,tierDistribution,topRisks,quickWins}` }],
    maxTokens: 6144,
    temperature: 0.3,
  });

  let result: any;
  try { result = JSON.parse(raw.replace(/```json?\n?/g, '').replace(/```/g, '').trim()); } catch { result = { raw }; }
  return c.json(result);
});

// POST /team-ops/meeting — extract meeting insights
app.post('/meeting', async (c) => {
  const tenantId = c.get('tenantId');
  const body = await c.req.json().catch(() => ({}));
  const parsed = meetingSchema.safeParse(body);
  if (!parsed.success) throw new AppError('VALIDATION_ERROR', parsed.error.issues);

  const { transcript, meetingTitle = 'Untitled', attendees = [], meetingType = 'general', duration = 0 } = parsed.data;
  const truncated = transcript.length > 25000 ? transcript.slice(0, 25000) + '\n[TRUNCATED]' : transcript;

  const raw = await routedCompletion({
    model: ModelPreset.LONG_FORM,
    messages: [{ role: 'user', content: `Extract structured data from meeting transcript.\n\nMEETING: ${meetingTitle}\nTYPE: ${meetingType}\nATTENDEES: ${JSON.stringify(attendees)}\nDURATION: ${duration}s\n\nTRANSCRIPT:\n${truncated}\n\nReturn JSON: {summary, decisions[], actionItems[], openQuestions[], keyInsights[], implicitCommitments[], followUps[], sentiment, meetingEffectiveness}` }],
    maxTokens: 6144,
    temperature: 0.2,
  });

  let result: any;
  try { result = JSON.parse(raw.replace(/```json?\n?/g, '').replace(/```/g, '').trim()); } catch { result = { raw }; }
  return c.json(result);
});

export { app as teamOpsRoutes };

/**
 * Onboarding Engine — State machine that drives the onboarding flow.
 * Tracks which step a tenant is on and transitions them through:
 *  initiated → detecting → connecting → activating → live
 */

import { eq } from 'drizzle-orm';
import { getDb, tenants } from '@nexuszero/db';
import type { Platform, OnboardingSession } from '@nexuszero/shared';
import { detectTechStack } from '../discovery/stack-detector.js';
import { generateAuthUrl } from '../oauth/oauth-manager.js';

export type OnboardingState = 'initiated' | 'detecting' | 'connecting' | 'activating' | 'live';

export interface OnboardingContext {
  tenantId: string;
  websiteUrl: string;
  detectedPlatforms: Platform[];
  connectedPlatforms: Platform[];
  failedPlatforms: Platform[];
  currentState: OnboardingState;
  startedAt: Date;
}

const onboardingSessions = new Map<string, OnboardingContext>();

/** Start a new onboarding session for a tenant */
export async function initiateOnboarding(
  tenantId: string,
  websiteUrl: string,
): Promise<OnboardingSession> {
  const context: OnboardingContext = {
    tenantId,
    websiteUrl,
    detectedPlatforms: [],
    connectedPlatforms: [],
    failedPlatforms: [],
    currentState: 'initiated',
    startedAt: new Date(),
  };

  onboardingSessions.set(tenantId, context);

  // Update tenant state
  const db = getDb();
  await db.update(tenants)
    .set({ onboardingState: 'initiated' })
    .where(eq(tenants.id, tenantId));

  return toSession(context);
}

/** Run the tech stack detection step */
export async function runDetection(tenantId: string): Promise<OnboardingSession> {
  const ctx = getContext(tenantId);
  ctx.currentState = 'detecting';

  const db = getDb();
  await db.update(tenants)
    .set({ onboardingState: 'detecting' })
    .where(eq(tenants.id, tenantId));

  const result = await detectTechStack(ctx.websiteUrl);
  ctx.detectedPlatforms = result.platforms;

  return toSession(ctx);
}

/** Generate OAuth URLs for all detected platforms that require OAuth */
export async function generateConnectionUrls(
  tenantId: string,
): Promise<{ platform: Platform; authUrl: string }[]> {
  const ctx = getContext(tenantId);
  ctx.currentState = 'connecting';

  const db = getDb();
  await db.update(tenants)
    .set({ onboardingState: 'connecting' })
    .where(eq(tenants.id, tenantId));

  const urls: { platform: Platform; authUrl: string }[] = [];

  for (const platform of ctx.detectedPlatforms) {
    try {
      const authUrl = await generateAuthUrl(platform, tenantId);
      urls.push({ platform, authUrl });
    } catch {
      // Some platforms don't use OAuth (e.g., API key only)
    }
  }

  return urls;
}

/** Record that a platform was successfully connected */
export function markPlatformConnected(tenantId: string, platform: Platform): void {
  const ctx = getContext(tenantId);
  if (!ctx.connectedPlatforms.includes(platform)) {
    ctx.connectedPlatforms.push(platform);
  }
  // Remove from failed if it was retried successfully
  ctx.failedPlatforms = ctx.failedPlatforms.filter((p) => p !== platform);
}

/** Record that a platform connection failed */
export function markPlatformFailed(tenantId: string, platform: Platform): void {
  const ctx = getContext(tenantId);
  if (!ctx.failedPlatforms.includes(platform)) {
    ctx.failedPlatforms.push(platform);
  }
}

/** Transition to activating state (agents are being assigned) */
export async function transitionToActivating(tenantId: string): Promise<OnboardingSession> {
  const ctx = getContext(tenantId);
  ctx.currentState = 'activating';

  const db = getDb();
  await db.update(tenants)
    .set({ onboardingState: 'activating' })
    .where(eq(tenants.id, tenantId));

  return toSession(ctx);
}

/** Mark onboarding as complete — tenant is live */
export async function completeOnboarding(tenantId: string): Promise<OnboardingSession> {
  const ctx = getContext(tenantId);
  ctx.currentState = 'live';

  const db = getDb();
  await db.update(tenants)
    .set({ onboardingState: 'live' })
    .where(eq(tenants.id, tenantId));

  // Clean up the in-memory session
  onboardingSessions.delete(tenantId);

  return toSession(ctx);
}

/** Get raw onboarding context (for internal use) */
export function getOnboardingContext(tenantId: string): OnboardingContext | undefined {
  return onboardingSessions.get(tenantId);
}

function getContext(tenantId: string): OnboardingContext {
  const ctx = onboardingSessions.get(tenantId);
  if (!ctx) throw new Error(`No onboarding session found for tenant ${tenantId}`);
  return ctx;
}

function toSession(ctx: OnboardingContext): OnboardingSession {
  return {
    tenantId: ctx.tenantId,
    websiteUrl: ctx.websiteUrl,
    detectedPlatforms: ctx.detectedPlatforms,
    connectedPlatforms: ctx.connectedPlatforms,
    failedPlatforms: ctx.failedPlatforms,
    currentStep: ctx.currentState,
    startedAt: ctx.startedAt,
  };
}

/**
 * Reauth Flow — Generate one-click re-authorization links for clients
 * when scopes are revoked or tokens can't be refreshed.
 */

import { randomBytes } from 'node:crypto';
import { getDb, integrations } from '@nexuszero/db';
import { eq } from 'drizzle-orm';
import type { Platform, ReauthLink } from '@nexuszero/shared';
import { generateAuthUrl, generateOAuthState } from './oauth-manager.js';
import { validateScopes, getRequiredScopes } from './scope-validator.js';
import { getRedisConnection } from '@nexuszero/queue';
import { env } from '../config/env.js';

const REAUTH_LINK_TTL_SECONDS = 86400; // 24 hours

/** Generate a one-click re-auth link for a degraded integration */
export async function generateReauthLink(
  integrationId: string,
  tenantId: string,
  platform: Platform,
  missingScopes?: string[],
): Promise<ReauthLink> {
  const redis = getRedisConnection();
  const state = generateOAuthState();

  // Store the state in Redis for callback verification
  const stateData = JSON.stringify({
    tenantId,
    platform,
    integrationId,
    type: 'reauth',
    nonce: randomBytes(16).toString('hex'),
    createdAt: Date.now(),
  });
  await redis.setex(`oauth:state:${state}`, REAUTH_LINK_TTL_SECONDS, stateData);

  // Determine which scopes to request
  const requiredScopes = missingScopes ?? getRequiredScopes(platform);
  const url = generateAuthUrl(platform, state, requiredScopes);

  return {
    integrationId,
    platform,
    url,
    expiresAt: new Date(Date.now() + REAUTH_LINK_TTL_SECONDS * 1000),
    missingScopes: requiredScopes,
  };
}

/** Handle the reauth callback — update existing integration with new tokens */
export async function processReauthCallback(
  state: string,
  code: string,
): Promise<{ success: boolean; integrationId: string; error?: string }> {
  const redis = getRedisConnection();
  const stateJson = await redis.get(`oauth:state:${state}`);

  if (!stateJson) {
    return { success: false, integrationId: '', error: 'Invalid or expired state' };
  }

  const stateData = JSON.parse(stateJson) as {
    tenantId: string;
    platform: Platform;
    integrationId: string;
  };

  // Clean up state
  await redis.del(`oauth:state:${state}`);

  try {
    // Import dynamically to avoid circular dependency
    const { exchangeCode } = await import('./oauth-manager.js');
    const { storeTokens } = await import('./token-vault.js');

    const tokens = await exchangeCode(stateData.platform, code);
    await storeTokens(stateData.integrationId, tokens);

    // Update integration status
    const db = getDb();
    await db.update(integrations).set({
      status: 'connected',
      errorCount: 0,
      lastError: null,
      healthScore: 100,
      lastSuccessfulCall: new Date(),
      updatedAt: new Date(),
    }).where(eq(integrations.id, stateData.integrationId));

    return { success: true, integrationId: stateData.integrationId };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    return { success: false, integrationId: stateData.integrationId, error: errMsg };
  }
}

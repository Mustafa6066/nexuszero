/**
 * Token Vault — Encrypted storage and retrieval of OAuth tokens.
 * Uses AES-256-GCM encryption via shared crypto utils.
 */

import { encrypt, decrypt } from '@nexuszero/shared';
import { getDb, integrations } from '@nexuszero/db';
import { eq, and } from 'drizzle-orm';
import { env } from '../config/env.js';
import type { Platform, OAuthTokens } from '@nexuszero/shared';

/** Store encrypted tokens for an integration */
export async function storeTokens(
  integrationId: string,
  tokens: OAuthTokens,
): Promise<void> {
  const db = getDb();

  const accessTokenEncrypted = encrypt(tokens.accessToken, env.encryptionKey);
  const refreshTokenEncrypted = tokens.refreshToken
    ? encrypt(tokens.refreshToken, env.encryptionKey)
    : null;

  await db.update(integrations).set({
    accessTokenEncrypted,
    refreshTokenEncrypted,
    tokenExpiresAt: tokens.expiresAt,
    scopesGranted: tokens.scopes,
    updatedAt: new Date(),
  }).where(eq(integrations.id, integrationId));
}

/** Retrieve and decrypt tokens for an integration */
export async function retrieveTokens(integrationId: string): Promise<OAuthTokens | null> {
  const db = getDb();

  const [row] = await db
    .select({
      accessTokenEncrypted: integrations.accessTokenEncrypted,
      refreshTokenEncrypted: integrations.refreshTokenEncrypted,
      tokenExpiresAt: integrations.tokenExpiresAt,
      scopesGranted: integrations.scopesGranted,
    })
    .from(integrations)
    .where(eq(integrations.id, integrationId))
    .limit(1);

  if (!row) return null;

  const accessToken = decrypt(row.accessTokenEncrypted, env.encryptionKey);
  const refreshToken = row.refreshTokenEncrypted
    ? decrypt(row.refreshTokenEncrypted, env.encryptionKey)
    : null;

  return {
    accessToken,
    refreshToken,
    tokenType: 'Bearer',
    expiresAt: row.tokenExpiresAt ?? new Date(0),
    scopes: row.scopesGranted ?? [],
  };
}

/** Check if a token is expired or about to expire (within buffer) */
export function isTokenExpired(expiresAt: Date, bufferSeconds = 300): boolean {
  const bufferMs = bufferSeconds * 1000;
  return Date.now() >= expiresAt.getTime() - bufferMs;
}

/** Create a new integration record with encrypted tokens */
export async function createIntegration(params: {
  tenantId: string;
  platform: Platform;
  tokens: OAuthTokens;
  detectedVia: 'auto_discovery' | 'manual_connect';
  apiVersion?: string;
  config?: Record<string, unknown>;
  scopesRequired?: string[];
}): Promise<string> {
  const db = getDb();

  const accessTokenEncrypted = encrypt(params.tokens.accessToken, env.encryptionKey);
  const refreshTokenEncrypted = params.tokens.refreshToken
    ? encrypt(params.tokens.refreshToken, env.encryptionKey)
    : null;

  const [row] = await db.insert(integrations).values({
    tenantId: params.tenantId,
    platform: params.platform,
    status: 'connected',
    accessTokenEncrypted,
    refreshTokenEncrypted,
    tokenExpiresAt: params.tokens.expiresAt,
    scopesGranted: params.tokens.scopes,
    scopesRequired: params.scopesRequired ?? params.tokens.scopes,
    apiVersion: params.apiVersion ?? null,
    detectedVia: params.detectedVia,
    config: params.config ?? {},
    healthScore: 100,
    errorCount: 0,
    lastSuccessfulCall: new Date(),
  }).returning({ id: integrations.id });

  return row!.id;
}

/** Get the integration record for a specific tenant/platform pair */
export async function getIntegrationByPlatform(
  tenantId: string,
  platform: Platform,
): Promise<typeof integrations.$inferSelect | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(integrations)
    .where(and(eq(integrations.tenantId, tenantId), eq(integrations.platform, platform)))
    .limit(1);
  return row ?? null;
}

/**
 * Stripe Connect OAuth Handler
 * Uses Stripe Connect's OAuth for connected accounts.
 */

import type { ConnectionResult, Platform } from '@nexuszero/shared';
import { createIntegration } from '../token-vault.js';
import { env } from '../../config/env.js';

/** Connect Stripe via OAuth */
export async function connectStripe(
  tenantId: string,
  code: string,
  detectedVia: 'auto_discovery' | 'manual_connect',
): Promise<ConnectionResult> {
  const platform: Platform = 'stripe_connect';
  try {
    const tokens = await exchangeStripeCode(code);
    const accountInfo = await getStripeAccountInfo(tokens.accessToken);

    const integrationId = await createIntegration({
      tenantId,
      platform,
      tokens: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // Stripe tokens don't expire
        scopes: ['read_write'],
      },
      detectedVia,
      apiVersion: '2024-06-20',
      config: {
        stripeUserId: tokens.stripeUserId,
        ...accountInfo,
      },
      scopesRequired: ['read_write'],
    });

    return {
      success: true,
      platform,
      scopes: ['read_write'],
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      accountId: integrationId,
      accountName: accountInfo.businessName,
    };
  } catch (error) {
    return {
      success: false,
      platform,
      scopes: [],
      expiresAt: new Date(0),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/** Exchange Stripe Connect authorization code */
async function exchangeStripeCode(
  code: string,
): Promise<{ accessToken: string; refreshToken: string; stripeUserId: string }> {
  const response = await fetch('https://connect.stripe.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_secret: env.stripeSecretKey,
    }),
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Stripe token exchange failed: ${response.status} ${body}`);
  }

  const data = await response.json() as Record<string, unknown>;
  return {
    accessToken: String(data.access_token ?? ''),
    refreshToken: String(data.refresh_token ?? ''),
    stripeUserId: String(data.stripe_user_id ?? ''),
  };
}

/** Get Stripe connected account info */
async function getStripeAccountInfo(
  accessToken: string,
): Promise<{ businessName: string; businessType: string; country: string }> {
  const response = await fetch('https://api.stripe.com/v1/account', {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    return { businessName: 'Stripe Account', businessType: '', country: '' };
  }

  const data = await response.json() as Record<string, unknown>;
  const businessProfile = (data.business_profile ?? {}) as Record<string, unknown>;
  return {
    businessName: String(businessProfile.name ?? data.id ?? 'Stripe Account'),
    businessType: String(data.business_type ?? ''),
    country: String(data.country ?? ''),
  };
}

/** Generate Stripe Connect OAuth URL */
export function generateStripeConnectUrl(state: string): string {
  const redirectUri = `${env.oauthCallbackUrl}/callback/stripe`;
  return `https://connect.stripe.com/oauth/authorize?response_type=code&client_id=${env.stripeClientId}&scope=read_write&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;
}

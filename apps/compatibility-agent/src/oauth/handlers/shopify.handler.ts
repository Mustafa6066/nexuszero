/**
 * Shopify OAuth Handler
 * Shopify uses per-store OAuth with custom app installation.
 */

import type { ConnectionResult, Platform } from '@nexuszero/shared';
import { createIntegration } from '../token-vault.js';
import { env } from '../../config/env.js';

/** Connect Shopify store via OAuth callback */
export async function connectShopify(
  tenantId: string,
  code: string,
  shop: string,
  detectedVia: 'auto_discovery' | 'manual_connect',
): Promise<ConnectionResult> {
  const platform: Platform = 'shopify';
  try {
    // Shopify token exchange is per-store
    const tokens = await exchangeShopifyCode(shop, code);
    const shopInfo = await getShopifyShopInfo(shop, tokens.accessToken);

    const integrationId = await createIntegration({
      tenantId,
      platform,
      tokens: {
        accessToken: tokens.accessToken,
        refreshToken: undefined, // Shopify offline tokens don't expire
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        scopes: tokens.scopes,
      },
      detectedVia,
      apiVersion: '2024-07',
      config: { shop, ...shopInfo },
      scopesRequired: ['read_products', 'read_orders', 'read_analytics', 'read_marketing_events'],
    });

    return {
      success: true,
      platform,
      scopes: tokens.scopes,
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      accountId: integrationId,
      accountName: shopInfo.shopName,
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

/** Exchange Shopify OAuth code for an offline access token */
async function exchangeShopifyCode(
  shop: string,
  code: string,
): Promise<{ accessToken: string; scopes: string[] }> {
  const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: env.shopifyApiKey,
      client_secret: env.shopifyApiSecret,
      code,
    }),
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Shopify token exchange failed: ${response.status} ${body}`);
  }

  const data = await response.json() as { access_token: string; scope: string };
  return {
    accessToken: data.access_token,
    scopes: data.scope.split(','),
  };
}

/** Get Shopify shop info */
async function getShopifyShopInfo(
  shop: string,
  accessToken: string,
): Promise<{ shopName: string; shopDomain: string; planName: string }> {
  const response = await fetch(`https://${shop}/admin/api/2024-07/shop.json`, {
    headers: { 'X-Shopify-Access-Token': accessToken },
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    return { shopName: shop, shopDomain: shop, planName: '' };
  }

  const data = await response.json() as { shop?: Record<string, unknown> };
  const s = data.shop ?? {};
  return {
    shopName: String(s.name ?? shop),
    shopDomain: String(s.myshopify_domain ?? shop),
    planName: String(s.plan_name ?? ''),
  };
}

/** Generate Shopify OAuth install URL */
export function generateShopifyInstallUrl(shop: string, state: string): string {
  const scopes = 'read_products,read_orders,read_analytics,read_marketing_events';
  const redirectUri = `${env.oauthCallbackUrl}/callback/shopify`;
  return `https://${shop}/admin/oauth/authorize?client_id=${env.shopifyApiKey}&scope=${scopes}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;
}

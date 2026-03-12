/**
 * WordPress OAuth Handler
 * WordPress.com uses Jetpack/WPCOM OAuth for hosted sites.
 * Self-hosted WP uses application passwords (no OAuth needed).
 */

import type { ConnectionResult, Platform } from '@nexuszero/shared';
import { exchangeCode } from '../oauth-manager.js';
import { createIntegration } from '../token-vault.js';

/** Connect WordPress.com via OAuth */
export async function connectWordPress(
  tenantId: string,
  code: string,
  detectedVia: 'auto_discovery' | 'manual_connect',
): Promise<ConnectionResult> {
  const platform: Platform = 'wordpress';
  try {
    const tokens = await exchangeCode(platform, code);
    const siteInfo = await getWordPressSiteInfo(tokens.accessToken);

    const integrationId = await createIntegration({
      tenantId,
      platform,
      tokens,
      detectedVia,
      apiVersion: 'wp/v2',
      config: siteInfo,
      scopesRequired: ['global'],
    });

    return {
      success: true,
      platform,
      scopes: tokens.scopes,
      expiresAt: tokens.expiresAt,
      accountId: integrationId,
      accountName: siteInfo.blogName,
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

/** Connect self-hosted WordPress via application password (REST API) */
export async function connectSelfHostedWordPress(
  tenantId: string,
  siteUrl: string,
  username: string,
  applicationPassword: string,
  detectedVia: 'auto_discovery' | 'manual_connect',
): Promise<ConnectionResult> {
  const platform: Platform = 'wordpress';
  try {
    // Verify connection by fetching site info
    const basicAuth = Buffer.from(`${username}:${applicationPassword}`).toString('base64');
    const response = await fetch(`${siteUrl}/wp-json/wp/v2/settings`, {
      headers: { Authorization: `Basic ${basicAuth}` },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(`WordPress REST API returned ${response.status}`);
    }

    const settings = await response.json() as Record<string, unknown>;

    // Store as non-expiring token (application passwords don't expire)
    const tokens = {
      accessToken: applicationPassword,
      refreshToken: null, // Application passwords don't expire
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
      scopes: ['global'],
    };

    const integrationId = await createIntegration({
      tenantId,
      platform,
      tokens,
      detectedVia,
      apiVersion: 'wp/v2',
      config: {
        siteUrl,
        username,
        selfHosted: true,
        blogName: String(settings.title ?? siteUrl),
      },
      scopesRequired: ['global'],
    });

    return {
      success: true,
      platform,
      scopes: ['global'],
      expiresAt: tokens.expiresAt,
      accountId: integrationId,
      accountName: String(settings.title ?? siteUrl),
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

/** Get WordPress.com site info */
async function getWordPressSiteInfo(
  accessToken: string,
): Promise<{ blogId: string; blogName: string; blogUrl: string }> {
  const response = await fetch('https://public-api.wordpress.com/rest/v1.1/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    return { blogId: '', blogName: 'WordPress', blogUrl: '' };
  }

  const data = await response.json() as Record<string, unknown>;
  const primaryBlog = (data.primary_blog_url as string) ?? '';
  return {
    blogId: String(data.primary_blog ?? ''),
    blogName: String(data.display_name ?? 'WordPress'),
    blogUrl: primaryBlog,
  };
}

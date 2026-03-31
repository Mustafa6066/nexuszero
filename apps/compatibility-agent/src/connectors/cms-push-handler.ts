/**
 * CMS Push Handler — executes approved CMS changes through platform connectors.
 *
 * Receives signals for approved changes and pushes them to the actual CMS.
 * Uses the compatibility-agent's connectors and token vault for secure access.
 */

import { withTenantDb, cmsChanges, integrations } from '@nexuszero/db';
import { eq, and } from 'drizzle-orm';
import { retrieveTokens } from '../oauth/token-vault.js';
import { WordPressConnector } from '../connectors/cms/wordpress.connector.js';
import { WebflowConnector } from '../connectors/cms/webflow.connector.js';
import { ShopifyConnector } from '../connectors/cms/shopify.connector.js';
import { ContentfulConnector } from '../connectors/cms/contentful.connector.js';

const wordpress = new WordPressConnector();
const webflow = new WebflowConnector();
const shopify = new ShopifyConnector();
const contentful = new ContentfulConnector();

export interface PushResult {
  changeId: string;
  success: boolean;
  platformResponse?: unknown;
  error?: string;
}

/**
 * Execute an approved CMS change against the target platform.
 */
export async function executeCmsChange(
  tenantId: string,
  changeId: string,
): Promise<PushResult> {
  // 1. Load the change record
  const change = await withTenantDb(tenantId, async (db) => {
    const [c] = await db.select().from(cmsChanges)
      .where(and(
        eq(cmsChanges.id, changeId),
        eq(cmsChanges.tenantId, tenantId),
      ))
      .limit(1);
    return c;
  });

  if (!change) {
    return { changeId, success: false, error: 'Change not found' };
  }

  if (change.status !== 'approved') {
    return { changeId, success: false, error: `Change status is ${change.status}, expected approved` };
  }

  // 2. Get integration details and tokens
  const integration = await withTenantDb(tenantId, async (db) => {
    const [i] = await db.select().from(integrations)
      .where(eq(integrations.id, change.integrationId))
      .limit(1);
    return i;
  });

  if (!integration) {
    await markFailed(tenantId, changeId, 'Integration not found');
    return { changeId, success: false, error: 'Integration not found' };
  }

  const tokens = await retrieveTokens(integration.id);
  if (!tokens) {
    await markFailed(tenantId, changeId, 'No tokens available');
    return { changeId, success: false, error: 'No tokens available for integration' };
  }

  const afterState = (change.afterState as Record<string, unknown>) || {};
  const config = (integration.config as Record<string, unknown>) || {};

  // 3. Execute the change on the appropriate platform
  try {
    let platformResponse: unknown;

    switch (change.platform) {
      case 'wordpress':
        platformResponse = await pushToWordPress(
          tokens.accessToken, config, change.scope, change.resourceType, change.resourceId, afterState,
        );
        break;
      case 'webflow':
        platformResponse = await pushToWebflow(
          tokens.accessToken, config, change.scope, change.resourceType, change.resourceId, afterState,
        );
        break;
      case 'shopify':
        platformResponse = await pushToShopify(
          tokens.accessToken, config, change.scope, change.resourceType, change.resourceId, afterState,
        );
        break;
      case 'contentful':
        platformResponse = await pushToContentful(
          tokens.accessToken, config, change.scope, change.resourceType, change.resourceId, afterState,
        );
        break;
      default:
        await markFailed(tenantId, changeId, `Unsupported platform: ${change.platform}`);
        return { changeId, success: false, error: `Unsupported platform: ${change.platform}` };
    }

    // 4. Mark as pushed
    await withTenantDb(tenantId, async (db) => {
      await db.update(cmsChanges)
        .set({ status: 'pushed', updatedAt: new Date() })
        .where(eq(cmsChanges.id, changeId));
    });

    return { changeId, success: true, platformResponse };
  } catch (e) {
    const errorMsg = (e as Error).message;
    await markFailed(tenantId, changeId, errorMsg);
    return { changeId, success: false, error: errorMsg };
  }
}

async function markFailed(tenantId: string, changeId: string, error: string): Promise<void> {
  await withTenantDb(tenantId, async (db) => {
    await db.update(cmsChanges)
      .set({ status: 'failed', updatedAt: new Date() })
      .where(eq(cmsChanges.id, changeId));
  });
  console.error(`CMS push failed for change ${changeId}:`, error);
}

// --- Platform-specific push logic ---

async function pushToWordPress(
  accessToken: string,
  config: Record<string, unknown>,
  scope: string,
  resourceType: string,
  resourceId: string,
  afterState: Record<string, unknown>,
) {
  const siteId = (config.siteId as string) || '';

  if (scope === 'schema' || scope === 'script') {
    return wordpress.injectHeadScript(accessToken, siteId, afterState.schemaScript as string || '');
  }

  if (resourceType === 'post') {
    return wordpress.updatePost(accessToken, siteId, resourceId, {
      title: afterState.metaTitle as string | undefined,
      excerpt: afterState.metaDescription as string | undefined,
      meta: afterState.meta as Record<string, unknown> | undefined,
    });
  }

  return wordpress.updatePage(accessToken, siteId, resourceId, {
    title: afterState.metaTitle as string | undefined,
    excerpt: afterState.metaDescription as string | undefined,
    meta: afterState.meta as Record<string, unknown> | undefined,
  });
}

async function pushToWebflow(
  accessToken: string,
  config: Record<string, unknown>,
  scope: string,
  resourceType: string,
  resourceId: string,
  afterState: Record<string, unknown>,
) {
  const siteId = (config.siteId as string) || '';

  if (scope === 'schema' || scope === 'script') {
    return webflow.addCustomCode(accessToken, siteId, { headCode: (afterState.schemaScript as string) || '' });
  }

  if (resourceType === 'collection_item') {
    const collectionId = (config.collectionId as string) || '';
    return webflow.updateCollectionItem(accessToken, collectionId, resourceId, { fieldData: afterState });
  }

  return webflow.updatePage(accessToken, resourceId, afterState as { title?: string; description?: string; slug?: string; openGraph?: Record<string, unknown> });
}

async function pushToShopify(
  accessToken: string,
  config: Record<string, unknown>,
  scope: string,
  resourceType: string,
  resourceId: string,
  afterState: Record<string, unknown>,
) {
  const shop = (config.shop as string) || '';

  if (scope === 'schema' || scope === 'meta') {
    const namespace = (afterState.namespace as string) || 'seo';
    const key = (afterState.key as string) || 'schema_markup';
    return shopify.updateMetafield(shop, accessToken, {
      namespace,
      key,
      value: JSON.stringify(afterState.jsonLd || afterState),
      type: 'json',
      owner_resource: resourceType,
      owner_id: resourceId,
    });
  }

  if (resourceType === 'product') {
    return shopify.updateProduct(accessToken, shop, resourceId, afterState);
  }

  return shopify.updatePage(accessToken, shop, resourceId, afterState);
}

async function pushToContentful(
  accessToken: string,
  config: Record<string, unknown>,
  scope: string,
  _resourceType: string,
  resourceId: string,
  afterState: Record<string, unknown>,
) {
  const spaceId = (config.spaceId as string) || '';
  const environmentId = (config.environmentId as string) || 'master';

  const result = await contentful.updateEntry(accessToken, spaceId, resourceId, { fields: afterState }, 0, environmentId);

  // Auto-publish if scope is safe
  if (scope === 'meta' || scope === 'schema') {
    const version = (result as any)?.data?.sys?.version || 1;
    await contentful.publishEntry(accessToken, spaceId, resourceId, version, environmentId);
  }

  return result;
}

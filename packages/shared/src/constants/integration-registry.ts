/**
 * Integration registry — definitions for all supported platforms.
 * Maps each platform to its OAuth endpoints, required scopes, API details, etc.
 */

import type { Platform, PlatformCategory, ConnectorCapability } from '../types/integration.js';

export interface PlatformDefinition {
  platform: Platform;
  label: string;
  category: PlatformCategory;
  icon: string;
  authType: 'oauth2' | 'oauth2_pkce' | 'api_key' | 'app_password';
  oauth?: {
    authorizationUrl: string;
    tokenUrl: string;
    revokeUrl?: string;
    defaultScopes: string[];
    optionalScopes: string[];
    pkce: boolean;
  };
  api: {
    baseUrl: string;
    currentVersion: string;
    versionHeader?: string;
    rateLimitHeader?: string;
    rateLimitRemainingHeader?: string;
    rateLimitResetHeader?: string;
  };
  healthCheck: {
    endpoint: string;
    method: 'GET' | 'POST';
    expectedStatus: number;
    timeoutMs: number;
  };
  capabilities: ConnectorCapability[];
  tokenLifetimeSeconds: number;
  refreshable: boolean;
}

export const PLATFORM_REGISTRY: Record<Platform, PlatformDefinition> = {
  google_analytics: {
    platform: 'google_analytics',
    label: 'Google Analytics 4',
    category: 'analytics',
    icon: 'google-analytics',
    authType: 'oauth2',
    oauth: {
      authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      revokeUrl: 'https://oauth2.googleapis.com/revoke',
      defaultScopes: ['https://www.googleapis.com/auth/analytics.readonly'],
      optionalScopes: ['https://www.googleapis.com/auth/analytics.edit'],
      pkce: false,
    },
    api: {
      baseUrl: 'https://analyticsdata.googleapis.com/v1beta',
      currentVersion: 'v1beta',
      rateLimitRemainingHeader: 'x-ratelimit-remaining',
      rateLimitResetHeader: 'x-ratelimit-reset',
    },
    healthCheck: {
      endpoint: '/properties',
      method: 'GET',
      expectedStatus: 200,
      timeoutMs: 10000,
    },
    capabilities: [
      {
        type: 'analytics',
        actions: ['get_traffic', 'get_conversions', 'get_pageviews', 'get_user_demographics', 'get_real_time'],
        dataTypes: ['sessions', 'pageviews', 'conversions', 'revenue', 'events'],
      },
    ],
    tokenLifetimeSeconds: 3600,
    refreshable: true,
  },

  google_ads: {
    platform: 'google_ads',
    label: 'Google Ads',
    category: 'ads',
    icon: 'google-ads',
    authType: 'oauth2',
    oauth: {
      authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      revokeUrl: 'https://oauth2.googleapis.com/revoke',
      defaultScopes: ['https://www.googleapis.com/auth/adwords'],
      optionalScopes: [],
      pkce: false,
    },
    api: {
      baseUrl: 'https://googleads.googleapis.com',
      currentVersion: 'v17',
      versionHeader: 'x-goog-api-version',
      rateLimitRemainingHeader: 'x-ratelimit-remaining',
      rateLimitResetHeader: 'x-ratelimit-reset',
    },
    healthCheck: {
      endpoint: '/v17/customers:listAccessibleCustomers',
      method: 'GET',
      expectedStatus: 200,
      timeoutMs: 10000,
    },
    capabilities: [
      {
        type: 'ads',
        actions: ['get_campaigns', 'create_campaign', 'update_bids', 'get_ad_groups', 'get_keywords', 'get_performance'],
        dataTypes: ['campaigns', 'ad_groups', 'keywords', 'ads', 'conversions', 'cost'],
      },
    ],
    tokenLifetimeSeconds: 3600,
    refreshable: true,
  },

  google_search_console: {
    platform: 'google_search_console',
    label: 'Google Search Console',
    category: 'seo',
    icon: 'google-search-console',
    authType: 'oauth2',
    oauth: {
      authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      revokeUrl: 'https://oauth2.googleapis.com/revoke',
      defaultScopes: ['https://www.googleapis.com/auth/webmasters.readonly'],
      optionalScopes: ['https://www.googleapis.com/auth/webmasters'],
      pkce: false,
    },
    api: {
      baseUrl: 'https://searchconsole.googleapis.com',
      currentVersion: 'v1',
    },
    healthCheck: {
      endpoint: '/webmasters/v3/sites',
      method: 'GET',
      expectedStatus: 200,
      timeoutMs: 10000,
    },
    capabilities: [
      {
        type: 'seo',
        actions: ['get_search_analytics', 'get_sitemaps', 'get_crawl_errors', 'get_index_status'],
        dataTypes: ['queries', 'pages', 'clicks', 'impressions', 'position'],
      },
    ],
    tokenLifetimeSeconds: 3600,
    refreshable: true,
  },

  meta_ads: {
    platform: 'meta_ads',
    label: 'Meta Ads',
    category: 'ads',
    icon: 'meta',
    authType: 'oauth2',
    oauth: {
      authorizationUrl: 'https://www.facebook.com/v19.0/dialog/oauth',
      tokenUrl: 'https://graph.facebook.com/v19.0/oauth/access_token',
      revokeUrl: 'https://graph.facebook.com/v19.0/me/permissions',
      defaultScopes: ['ads_read', 'ads_management', 'business_management'],
      optionalScopes: ['pages_read_engagement', 'instagram_basic'],
      pkce: false,
    },
    api: {
      baseUrl: 'https://graph.facebook.com/v19.0',
      currentVersion: 'v19.0',
      rateLimitRemainingHeader: 'x-business-use-case-usage',
    },
    healthCheck: {
      endpoint: '/me',
      method: 'GET',
      expectedStatus: 200,
      timeoutMs: 10000,
    },
    capabilities: [
      {
        type: 'ads',
        actions: ['get_campaigns', 'create_campaign', 'get_ad_sets', 'get_ads', 'get_insights', 'get_audiences'],
        dataTypes: ['campaigns', 'ad_sets', 'ads', 'impressions', 'spend', 'conversions'],
      },
    ],
    tokenLifetimeSeconds: 5184000, // 60 days
    refreshable: true,
  },

  linkedin_ads: {
    platform: 'linkedin_ads',
    label: 'LinkedIn Ads',
    category: 'ads',
    icon: 'linkedin',
    authType: 'oauth2',
    oauth: {
      authorizationUrl: 'https://www.linkedin.com/oauth/v2/authorization',
      tokenUrl: 'https://www.linkedin.com/oauth/v2/accessToken',
      defaultScopes: ['r_ads', 'r_ads_reporting', 'rw_ads'],
      optionalScopes: ['r_organization_social', 'w_organization_social'],
      pkce: false,
    },
    api: {
      baseUrl: 'https://api.linkedin.com/rest',
      currentVersion: '202401',
      versionHeader: 'LinkedIn-Version',
      rateLimitRemainingHeader: 'x-li-fabric-limit-remaining',
      rateLimitResetHeader: 'x-li-fabric-limit-reset',
    },
    healthCheck: {
      endpoint: '/me',
      method: 'GET',
      expectedStatus: 200,
      timeoutMs: 10000,
    },
    capabilities: [
      {
        type: 'ads',
        actions: ['get_campaigns', 'create_campaign', 'get_analytics', 'get_audiences'],
        dataTypes: ['campaigns', 'creatives', 'impressions', 'spend', 'conversions'],
      },
    ],
    tokenLifetimeSeconds: 5184000, // 60 days
    refreshable: true,
  },

  hubspot: {
    platform: 'hubspot',
    label: 'HubSpot',
    category: 'crm',
    icon: 'hubspot',
    authType: 'oauth2',
    oauth: {
      authorizationUrl: 'https://app.hubspot.com/oauth/authorize',
      tokenUrl: 'https://api.hubapi.com/oauth/v1/token',
      defaultScopes: ['crm.objects.contacts.read', 'crm.objects.deals.read', 'crm.objects.companies.read'],
      optionalScopes: ['crm.objects.contacts.write', 'crm.objects.deals.write', 'forms', 'automation'],
      pkce: false,
    },
    api: {
      baseUrl: 'https://api.hubapi.com',
      currentVersion: 'v3',
      rateLimitRemainingHeader: 'x-hubspot-ratelimit-daily-remaining',
      rateLimitResetHeader: 'x-hubspot-ratelimit-secondly-remaining',
    },
    healthCheck: {
      endpoint: '/crm/v3/objects/contacts?limit=1',
      method: 'GET',
      expectedStatus: 200,
      timeoutMs: 10000,
    },
    capabilities: [
      {
        type: 'crm',
        actions: ['get_contacts', 'get_deals', 'get_companies', 'create_contact', 'get_pipelines', 'get_forms'],
        dataTypes: ['contacts', 'deals', 'companies', 'activities', 'pipelines'],
      },
    ],
    tokenLifetimeSeconds: 1800, // 30 minutes
    refreshable: true,
  },

  salesforce: {
    platform: 'salesforce',
    label: 'Salesforce',
    category: 'crm',
    icon: 'salesforce',
    authType: 'oauth2',
    oauth: {
      authorizationUrl: 'https://login.salesforce.com/services/oauth2/authorize',
      tokenUrl: 'https://login.salesforce.com/services/oauth2/token',
      revokeUrl: 'https://login.salesforce.com/services/oauth2/revoke',
      defaultScopes: ['api', 'refresh_token', 'id'],
      optionalScopes: ['full', 'chatter_api', 'wave_api'],
      pkce: true,
    },
    api: {
      baseUrl: 'https://login.salesforce.com',
      currentVersion: 'v60.0',
    },
    healthCheck: {
      endpoint: '/services/data/v60.0/limits',
      method: 'GET',
      expectedStatus: 200,
      timeoutMs: 10000,
    },
    capabilities: [
      {
        type: 'crm',
        actions: ['get_leads', 'get_opportunities', 'get_accounts', 'create_lead', 'get_reports'],
        dataTypes: ['leads', 'opportunities', 'accounts', 'contacts', 'activities'],
      },
    ],
    tokenLifetimeSeconds: 7200,
    refreshable: true,
  },

  wordpress: {
    platform: 'wordpress',
    label: 'WordPress',
    category: 'cms',
    icon: 'wordpress',
    authType: 'app_password',
    api: {
      baseUrl: '', // Dynamic per site
      currentVersion: 'wp/v2',
    },
    healthCheck: {
      endpoint: '/wp-json/wp/v2/posts?per_page=1',
      method: 'GET',
      expectedStatus: 200,
      timeoutMs: 15000,
    },
    capabilities: [
      {
        type: 'cms',
        actions: ['get_posts', 'create_post', 'update_post', 'get_pages', 'get_categories', 'get_media'],
        dataTypes: ['posts', 'pages', 'categories', 'tags', 'media'],
      },
    ],
    tokenLifetimeSeconds: 0, // Application passwords don't expire
    refreshable: false,
  },

  webflow: {
    platform: 'webflow',
    label: 'Webflow',
    category: 'cms',
    icon: 'webflow',
    authType: 'oauth2',
    oauth: {
      authorizationUrl: 'https://webflow.com/oauth/authorize',
      tokenUrl: 'https://api.webflow.com/oauth/access_token',
      defaultScopes: ['sites:read', 'sites:write', 'cms:read', 'cms:write'],
      optionalScopes: ['ecommerce:read', 'ecommerce:write'],
      pkce: false,
    },
    api: {
      baseUrl: 'https://api.webflow.com/v2',
      currentVersion: 'v2',
    },
    healthCheck: {
      endpoint: '/sites',
      method: 'GET',
      expectedStatus: 200,
      timeoutMs: 10000,
    },
    capabilities: [
      {
        type: 'cms',
        actions: ['get_sites', 'get_collections', 'create_item', 'update_item', 'publish_site'],
        dataTypes: ['sites', 'collections', 'items', 'domains'],
      },
    ],
    tokenLifetimeSeconds: 0, // Webflow tokens don't expire but can be revoked
    refreshable: false,
  },

  contentful: {
    platform: 'contentful',
    label: 'Contentful',
    category: 'cms',
    icon: 'contentful',
    authType: 'oauth2',
    oauth: {
      authorizationUrl: 'https://be.contentful.com/oauth/authorize',
      tokenUrl: 'https://be.contentful.com/oauth/token',
      defaultScopes: ['content_management_manage'],
      optionalScopes: [],
      pkce: false,
    },
    api: {
      baseUrl: 'https://api.contentful.com',
      currentVersion: 'v1',
    },
    healthCheck: {
      endpoint: '/spaces',
      method: 'GET',
      expectedStatus: 200,
      timeoutMs: 10000,
    },
    capabilities: [
      {
        type: 'cms',
        actions: ['get_spaces', 'get_entries', 'create_entry', 'publish_entry', 'get_content_types'],
        dataTypes: ['entries', 'assets', 'content_types', 'spaces'],
      },
    ],
    tokenLifetimeSeconds: 0,
    refreshable: false,
  },

  shopify: {
    platform: 'shopify',
    label: 'Shopify',
    category: 'cms',
    icon: 'shopify',
    authType: 'oauth2',
    oauth: {
      authorizationUrl: 'https://{shop}.myshopify.com/admin/oauth/authorize',
      tokenUrl: 'https://{shop}.myshopify.com/admin/oauth/access_token',
      defaultScopes: ['read_products', 'read_orders', 'read_analytics'],
      optionalScopes: ['write_products', 'write_content', 'read_customers'],
      pkce: false,
    },
    api: {
      baseUrl: 'https://{shop}.myshopify.com/admin/api/2024-01',
      currentVersion: '2024-01',
      rateLimitRemainingHeader: 'x-shopify-shop-api-call-limit',
    },
    healthCheck: {
      endpoint: '/shop.json',
      method: 'GET',
      expectedStatus: 200,
      timeoutMs: 10000,
    },
    capabilities: [
      {
        type: 'cms',
        actions: ['get_products', 'get_orders', 'get_analytics', 'create_product', 'get_customers'],
        dataTypes: ['products', 'orders', 'customers', 'analytics', 'collections'],
      },
    ],
    tokenLifetimeSeconds: 0, // Shopify offline tokens don't expire
    refreshable: false,
  },

  mixpanel: {
    platform: 'mixpanel',
    label: 'Mixpanel',
    category: 'analytics',
    icon: 'mixpanel',
    authType: 'api_key',
    api: {
      baseUrl: 'https://mixpanel.com/api',
      currentVersion: '2.0',
    },
    healthCheck: {
      endpoint: '/2.0/engage',
      method: 'GET',
      expectedStatus: 200,
      timeoutMs: 10000,
    },
    capabilities: [
      {
        type: 'analytics',
        actions: ['get_events', 'get_funnels', 'get_retention', 'get_segmentation'],
        dataTypes: ['events', 'funnels', 'retention', 'users'],
      },
    ],
    tokenLifetimeSeconds: 0,
    refreshable: false,
  },

  amplitude: {
    platform: 'amplitude',
    label: 'Amplitude',
    category: 'analytics',
    icon: 'amplitude',
    authType: 'api_key',
    api: {
      baseUrl: 'https://amplitude.com/api',
      currentVersion: '2',
    },
    healthCheck: {
      endpoint: '/2/events/segmentation',
      method: 'GET',
      expectedStatus: 200,
      timeoutMs: 10000,
    },
    capabilities: [
      {
        type: 'analytics',
        actions: ['get_events', 'get_funnels', 'get_retention', 'get_user_activity'],
        dataTypes: ['events', 'funnels', 'retention', 'users', 'cohorts'],
      },
    ],
    tokenLifetimeSeconds: 0,
    refreshable: false,
  },

  slack: {
    platform: 'slack',
    label: 'Slack',
    category: 'messaging',
    icon: 'slack',
    authType: 'oauth2',
    oauth: {
      authorizationUrl: 'https://slack.com/oauth/v2/authorize',
      tokenUrl: 'https://slack.com/api/oauth.v2.access',
      revokeUrl: 'https://slack.com/api/auth.revoke',
      defaultScopes: ['chat:write', 'channels:read'],
      optionalScopes: ['files:write', 'users:read'],
      pkce: false,
    },
    api: {
      baseUrl: 'https://slack.com/api',
      currentVersion: 'v2',
      rateLimitRemainingHeader: 'x-ratelimit-remaining',
      rateLimitResetHeader: 'retry-after',
    },
    healthCheck: {
      endpoint: '/auth.test',
      method: 'POST',
      expectedStatus: 200,
      timeoutMs: 10000,
    },
    capabilities: [
      {
        type: 'messaging',
        actions: ['send_message', 'get_channels', 'upload_file'],
        dataTypes: ['messages', 'channels', 'files'],
      },
    ],
    tokenLifetimeSeconds: 0,
    refreshable: false,
  },

  sendgrid: {
    platform: 'sendgrid',
    label: 'SendGrid',
    category: 'messaging',
    icon: 'sendgrid',
    authType: 'api_key',
    api: {
      baseUrl: 'https://api.sendgrid.com/v3',
      currentVersion: 'v3',
      rateLimitRemainingHeader: 'x-ratelimit-remaining',
      rateLimitResetHeader: 'x-ratelimit-reset',
    },
    healthCheck: {
      endpoint: '/scopes',
      method: 'GET',
      expectedStatus: 200,
      timeoutMs: 10000,
    },
    capabilities: [
      {
        type: 'messaging',
        actions: ['send_email', 'get_templates', 'get_stats'],
        dataTypes: ['emails', 'templates', 'stats', 'bounces'],
      },
    ],
    tokenLifetimeSeconds: 0,
    refreshable: false,
  },

  stripe_connect: {
    platform: 'stripe_connect',
    label: 'Stripe',
    category: 'payments',
    icon: 'stripe',
    authType: 'oauth2',
    oauth: {
      authorizationUrl: 'https://connect.stripe.com/oauth/authorize',
      tokenUrl: 'https://connect.stripe.com/oauth/token',
      revokeUrl: 'https://connect.stripe.com/oauth/deauthorize',
      defaultScopes: ['read_write'],
      optionalScopes: [],
      pkce: false,
    },
    api: {
      baseUrl: 'https://api.stripe.com/v1',
      currentVersion: 'v1',
      rateLimitRemainingHeader: 'x-ratelimit-limit',
    },
    healthCheck: {
      endpoint: '/balance',
      method: 'GET',
      expectedStatus: 200,
      timeoutMs: 10000,
    },
    capabilities: [
      {
        type: 'payments',
        actions: ['get_balance', 'get_transactions', 'get_customers', 'get_subscriptions'],
        dataTypes: ['transactions', 'customers', 'subscriptions', 'invoices'],
      },
    ],
    tokenLifetimeSeconds: 0,
    refreshable: false,
  },
};

/** Get all platforms in a given category */
export function getPlatformsByCategory(category: PlatformCategory): PlatformDefinition[] {
  return Object.values(PLATFORM_REGISTRY).filter(p => p.category === category);
}

/** Get only OAuth-based platforms (for auto-connect flows) */
export function getOAuthPlatforms(): PlatformDefinition[] {
  return Object.values(PLATFORM_REGISTRY).filter(p => p.authType === 'oauth2' || p.authType === 'oauth2_pkce');
}

/** Get all platforms that need active token refresh */
export function getRefreshablePlatforms(): PlatformDefinition[] {
  return Object.values(PLATFORM_REGISTRY).filter(p => p.refreshable);
}

/** Lookup a platform definition */
export function getPlatformDefinition(platform: Platform): PlatformDefinition {
  const def = PLATFORM_REGISTRY[platform];
  if (!def) throw new Error(`Unknown platform: ${platform}`);
  return def;
}

/** Health check thresholds */
export const HEALTH_THRESHOLDS = {
  /** Below this score, integration is marked degraded */
  DEGRADED_THRESHOLD: 50,
  /** Below this score, integration is marked disconnected */
  DISCONNECTED_THRESHOLD: 20,
  /** Health check interval in ms (15 minutes) */
  CHECK_INTERVAL_MS: 15 * 60 * 1000,
  /** Max consecutive failures before forcing re-auth */
  MAX_CONSECUTIVE_FAILURES: 5,
  /** Token refresh buffer — refresh this many seconds before expiry */
  TOKEN_REFRESH_BUFFER_SECONDS: 300,
  /** Max P95 latency before marking degraded (ms) */
  MAX_ACCEPTABLE_LATENCY_MS: 5000,
  /** Rate limit utilization threshold for throttling */
  RATE_LIMIT_THROTTLE_PERCENT: 80,
} as const;

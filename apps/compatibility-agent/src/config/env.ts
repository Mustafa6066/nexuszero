/** Environment configuration for Compatibility Agent */

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function optionalEnv(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

export const env = {
  port: parseInt(optionalEnv('PORT', '3006'), 10),
  nodeEnv: optionalEnv('NODE_ENV', 'development'),

  // Database
  databaseUrl: requireEnv('DATABASE_URL'),

  // Redis
  redisUrl: requireEnv('REDIS_URL'),

  // Kafka
  kafkaUrl: optionalEnv('KAFKA_URL', ''),
  kafkaUsername: optionalEnv('KAFKA_USERNAME', ''),
  kafkaPassword: optionalEnv('KAFKA_PASSWORD', ''),

  // Encryption key for token storage (hex-encoded AES-256 key)
  encryptionKey: requireEnv('ENCRYPTION_KEY'),

  // Internal HTTP API key — all non-health endpoints require this header
  // (X-Internal-Key: <value>). Required in production; optional in development.
  internalApiKey: requireEnv('INTERNAL_API_KEY'),

  // OAuth Client Credentials
  googleClientId: optionalEnv('GOOGLE_CLIENT_ID', ''),
  googleClientSecret: optionalEnv('GOOGLE_CLIENT_SECRET', ''),
  googleAdsDevToken: optionalEnv('GOOGLE_ADS_DEV_TOKEN', ''),

  metaAppId: optionalEnv('META_APP_ID', ''),
  metaAppSecret: optionalEnv('META_APP_SECRET', ''),

  linkedinClientId: optionalEnv('LINKEDIN_CLIENT_ID', ''),
  linkedinClientSecret: optionalEnv('LINKEDIN_CLIENT_SECRET', ''),

  hubspotClientId: optionalEnv('HUBSPOT_CLIENT_ID', ''),
  hubspotClientSecret: optionalEnv('HUBSPOT_CLIENT_SECRET', ''),

  salesforceClientId: optionalEnv('SALESFORCE_CLIENT_ID', ''),
  salesforceClientSecret: optionalEnv('SALESFORCE_CLIENT_SECRET', ''),

  shopifyApiKey: optionalEnv('SHOPIFY_API_KEY', ''),
  shopifyApiSecret: optionalEnv('SHOPIFY_API_SECRET', ''),

  slackClientId: optionalEnv('SLACK_CLIENT_ID', ''),
  slackClientSecret: optionalEnv('SLACK_CLIENT_SECRET', ''),

  stripeClientId: optionalEnv('STRIPE_CLIENT_ID', ''),
  stripeSecretKey: optionalEnv('STRIPE_SECRET_KEY', ''),

  // LLM
  anthropicApiKey: optionalEnv('ANTHROPIC_API_KEY', ''),

  // OAuth Callback URL base
  oauthCallbackUrl: optionalEnv('OAUTH_CALLBACK_URL', 'http://localhost:3001/api/v1/onboarding/oauth-callback'),

  // Health check intervals
  healthCheckIntervalMs: parseInt(optionalEnv('HEALTH_CHECK_INTERVAL_MS', '900000'), 10), // 15 min
  tokenRefreshCheckMs: parseInt(optionalEnv('TOKEN_REFRESH_CHECK_MS', '60000'), 10), // 1 min
  schemaDriftCheckMs: parseInt(optionalEnv('SCHEMA_DRIFT_CHECK_MS', '3600000'), 10), // 1 hour
} as const;

// Warn at startup about unconfigured OAuth providers (non-fatal — service
// functions normally for configured platforms only).
const OAUTH_WARNINGS: Array<[string, string, string]> = [
  ['GOOGLE_CLIENT_ID', env.googleClientId, 'Google (Analytics/Ads/Search Console)'],
  ['META_APP_ID', env.metaAppId, 'Meta Ads'],
  ['LINKEDIN_CLIENT_ID', env.linkedinClientId, 'LinkedIn Ads'],
  ['HUBSPOT_CLIENT_ID', env.hubspotClientId, 'HubSpot'],
  ['SALESFORCE_CLIENT_ID', env.salesforceClientId, 'Salesforce'],
  ['SHOPIFY_API_KEY', env.shopifyApiKey, 'Shopify'],
  ['SLACK_CLIENT_ID', env.slackClientId, 'Slack'],
  ['STRIPE_CLIENT_ID', env.stripeClientId, 'Stripe Connect'],
];

for (const [varName, value, label] of OAUTH_WARNINGS) {
  if (!value) {
    console.warn(`[env] ${varName} not set — ${label} connector will not function`);
  }
}

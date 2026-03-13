import { getDb, getPostgresClient, schema } from './client.js';
import { hashPassword, generateApiKey, sha256Hash, generateWebhookSecret } from '@nexuszero/shared';

export async function seed() {
  const db = getDb();
  const sql = getPostgresClient();

  console.log('Seeding database...');

  // Create demo tenant
  const [tenant] = await db.insert(schema.tenants).values({
    slug: 'demo-tenant',
    name: 'Demo Company',
    domain: 'demo.nexuszero.dev',
    plan: 'growth',
    status: 'active',
    onboardingState: 'completed',
    settings: {
      timezone: 'America/New_York',
      industry: 'saas',
      notificationEmail: 'admin@demo.nexuszero.dev',
      weeklyReportEnabled: true,
    },
  }).returning();

  console.log(`Created tenant: ${tenant.id} (${tenant.slug})`);

  // Create admin user
  const passwordHash = await hashPassword('DemoPassword123!');
  const [user] = await db.insert(schema.users).values({
    tenantId: tenant.id,
    email: 'admin@demo.nexuszero.dev',
    name: 'Demo Admin',
    passwordHash,
    role: 'owner',
  }).returning();

  console.log(`Created user: ${user.id} (${user.email})`);

  // Create API key
  const rawKey = generateApiKey();
  const keyHash = sha256Hash(rawKey);
  const [apiKey] = await db.insert(schema.apiKeys).values({
    tenantId: tenant.id,
    name: 'Default API Key',
    keyHash,
    keyPrefix: rawKey.substring(0, 7),
    scopes: ['read', 'write', 'admin'],
  }).returning();

  console.log(`Created API key: ${apiKey.id} (prefix: ${apiKey.keyPrefix})`);
  console.log(`  Full key (save this): ${rawKey}`);

  // Create agents
  const agentTypes = ['seo', 'ad', 'creative', 'data-nexus', 'aeo', 'compatibility'] as const;
  for (const type of agentTypes) {
    const [agent] = await db.insert(schema.agents).values({
      tenantId: tenant.id,
      type,
      status: 'idle',
      metadata: {},
    }).returning();
    console.log(`Created agent: ${agent.id} (${type})`);
  }

  // Create sample campaign
  const [campaign] = await db.insert(schema.campaigns).values({
    tenantId: tenant.id,
    name: 'Demo SEO Campaign',
    type: 'seo',
    status: 'active',
    platform: 'google_ads',
    budget: { daily: 100, monthly: 3000, currency: 'USD' },
    targeting: { locations: ['US'], languages: ['en'] },
    schedule: {},
    config: { keywords: ['saas platform', 'marketing automation'], targetPages: ['/'] },
  }).returning();

  console.log(`Created campaign: ${campaign.id} (${campaign.name})`);

  // Create webhook endpoint
  const webhookSecret = generateWebhookSecret();
  const [webhook] = await db.insert(schema.webhookEndpoints).values({
    tenantId: tenant.id,
    url: 'https://webhook.site/demo',
    secret: webhookSecret,
    events: ['campaign.updated', 'agent.task.completed'],
    status: 'active',
    description: 'Demo webhook endpoint',
  }).returning();

  console.log(`Created webhook: ${webhook.id}`);
  console.log(`  Webhook secret (save this): ${webhookSecret}`);

  console.log('\nSeed completed successfully!');
  await sql.end();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  initializeOpenTelemetryMock: vi.fn(async () => undefined),
  registerConnectorMock: vi.fn(),
  workerStartMock: vi.fn(async () => undefined),
  cronScheduleMock: vi.fn(),
  serveMock: vi.fn(),
  getDbMock: vi.fn(),
  insertValuesMock: vi.fn(async () => undefined),
}));

const tables = vi.hoisted(() => ({
  tenants: { id: 'tenants.id', status: 'tenants.status' },
  agents: { tenantId: 'agents.tenantId', type: 'agents.type', status: 'agents.status' },
  integrations: { tenantId: 'integrations.tenantId', id: 'integrations.id', platform: 'integrations.platform', status: 'integrations.status' },
}));

vi.mock('@nexuszero/shared', () => ({
  initializeOpenTelemetry: mocks.initializeOpenTelemetryMock,
}));

vi.mock('@nexuszero/db', () => {
  function createQuery() {
    let currentTable: unknown;

    const query = {
      from(table: unknown) {
        currentTable = table;
        return query;
      },
      where() {
        return query;
      },
      limit() {
        if (currentTable === tables.agents) {
          return Promise.resolve([]);
        }
        return Promise.resolve([]);
      },
      then(resolve: (value: unknown[]) => unknown, reject?: (reason: unknown) => unknown) {
        if (currentTable === tables.tenants) {
          return Promise.resolve([{ id: 'tenant-1' }, { id: 'tenant-2' }]).then(resolve, reject);
        }
        if (currentTable === tables.agents) {
          return Promise.resolve([]).then(resolve, reject);
        }
        if (currentTable === tables.integrations) {
          return Promise.resolve([]).then(resolve, reject);
        }
        return Promise.resolve([]).then(resolve, reject);
      },
    };

    return query;
  }

  const fakeDb = {
    select: () => createQuery(),
    insert: () => ({ values: mocks.insertValuesMock }),
  };

  mocks.getDbMock.mockReturnValue(fakeDb);

  return {
    getDb: mocks.getDbMock,
    tenants: tables.tenants,
    agents: tables.agents,
    integrations: tables.integrations,
  };
});

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => ({ kind: 'eq' })),
  and: vi.fn(() => ({ kind: 'and' })),
}));

vi.mock('node-cron', () => ({
  default: {
    schedule: mocks.cronScheduleMock,
  },
}));

vi.mock('@hono/node-server', () => ({
  serve: mocks.serveMock,
}));

vi.mock('../src/agent.js', () => ({
  CompatibilityWorker: class {
    start = mocks.workerStartMock;
  },
}));

vi.mock('../src/config/env.js', () => ({
  env: {
    port: 4010,
    internalApiKey: 'internal-secret',
  },
}));

vi.mock('@nexuszero/queue', () => ({
  getRedisConnection: vi.fn(() => ({ get: vi.fn(), del: vi.fn() })),
}));

vi.mock('../src/connectors/connector-registry.js', () => ({
  registerConnector: mocks.registerConnectorMock,
}));

vi.mock('../src/oauth/token-refresher.js', () => ({ refreshExpiringTokens: vi.fn(async () => undefined) }));
vi.mock('../src/health/health-monitor.js', () => ({ runHealthSweep: vi.fn(async () => undefined) }));
vi.mock('../src/schema/schema-tracker.js', () => ({ refreshSchemaSnapshots: vi.fn(async () => undefined) }));
vi.mock('../src/healing/healing-orchestrator.js', () => ({ runGlobalHealingSweep: vi.fn(async () => undefined) }));
vi.mock('../src/discovery/stack-detector.js', () => ({ detectTechStack: vi.fn(async () => ({})) }));
vi.mock('../src/oauth/oauth-manager.js', () => ({ generateAuthUrl: vi.fn(async () => 'https://auth'), completeOAuthFlow: vi.fn(async () => ({})) }));
vi.mock('../src/oauth/reauth-flow.js', () => ({ processReauthCallback: vi.fn(async () => ({})) }));
vi.mock('../src/health/health-reporter.js', () => ({ getHealthSummary: vi.fn(async () => ({})), getHealthLogs: vi.fn(async () => []) }));
vi.mock('../src/healing/circuit-state-manager.js', () => ({ getAllCircuitStatuses: vi.fn(() => ({})) }));

vi.mock('../src/connectors/analytics/google-analytics.connector.js', () => ({ GoogleAnalyticsConnector: class {} }));
vi.mock('../src/connectors/analytics/mixpanel.connector.js', () => ({ MixpanelConnector: class {} }));
vi.mock('../src/connectors/analytics/amplitude.connector.js', () => ({ AmplitudeConnector: class {} }));
vi.mock('../src/connectors/ads/google-ads.connector.js', () => ({ GoogleAdsConnector: class {} }));
vi.mock('../src/connectors/ads/meta-ads.connector.js', () => ({ MetaAdsConnector: class {} }));
vi.mock('../src/connectors/ads/linkedin-ads.connector.js', () => ({ LinkedInAdsConnector: class {} }));
vi.mock('../src/connectors/seo/google-search-console.connector.js', () => ({ GoogleSearchConsoleConnector: class {} }));
vi.mock('../src/connectors/crm/hubspot.connector.js', () => ({ HubSpotConnector: class {} }));
vi.mock('../src/connectors/crm/salesforce.connector.js', () => ({ SalesforceConnector: class {} }));
vi.mock('../src/connectors/cms/wordpress.connector.js', () => ({ WordPressConnector: class {} }));
vi.mock('../src/connectors/cms/webflow.connector.js', () => ({ WebflowConnector: class {} }));
vi.mock('../src/connectors/cms/contentful.connector.js', () => ({ ContentfulConnector: class {} }));
vi.mock('../src/connectors/cms/shopify.connector.js', () => ({ ShopifyConnector: class {} }));
vi.mock('../src/connectors/messaging/slack.connector.js', () => ({ SlackConnector: class {} }));
vi.mock('../src/connectors/messaging/sendgrid.connector.js', () => ({ SendGridConnector: class {} }));
vi.mock('../src/connectors/payments/stripe.connector.js', () => ({ StripeConnector: class {} }));

describe('compatibility-agent bootstrap', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('initializes telemetry, registers connectors, schedules cron jobs, and starts the worker', async () => {
    const { main } = await import('../src/index.js');

    await main();

    expect(mocks.initializeOpenTelemetryMock).toHaveBeenCalledWith({ serviceName: 'compatibility-agent' });
    expect(mocks.registerConnectorMock).toHaveBeenCalledTimes(16);
    expect(mocks.registerConnectorMock).toHaveBeenCalledWith('google_analytics', expect.any(Object));
    expect(mocks.registerConnectorMock).toHaveBeenCalledWith('stripe_connect', expect.any(Object));
    expect(mocks.insertValuesMock).toHaveBeenCalledTimes(2);
    expect(mocks.workerStartMock).toHaveBeenCalledWith(['tenant-1', 'tenant-2']);
    expect(mocks.cronScheduleMock).toHaveBeenCalledTimes(4);
    expect(mocks.serveMock).toHaveBeenCalledWith(expect.objectContaining({ port: 4010 }), expect.any(Function));
  });
});
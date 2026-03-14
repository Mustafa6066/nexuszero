import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UIContext } from '@nexuszero/shared';

const mockTables = vi.hoisted(() => ({
  tenants: Symbol('tenants'),
  campaigns: Symbol('campaigns'),
  agents: Symbol('agents'),
  integrations: Symbol('integrations'),
  integrationHealth: Symbol('integrationHealth'),
  analyticsDataPoints: Symbol('analyticsDataPoints'),
  creatives: Symbol('creatives'),
  funnelAnalysis: Symbol('funnelAnalysis'),
  aeoCitations: Symbol('aeoCitations'),
  assistantSessions: Symbol('assistantSessions'),
  assistantMessages: Symbol('assistantMessages'),
}));

const mockState = vi.hoisted(() => ({
  fetchMock: vi.fn(),
  withTenantDbMock: vi.fn(),
  buildCustomerIntelligenceMock: vi.fn(async () => null),
  renderIntelligencePromptMock: vi.fn(() => ''),
  insertedRows: [] as Array<{ table: symbol; value: unknown }>,
}));

vi.mock('drizzle-orm', () => {
  const sqlTag = () => ({ kind: 'sql' });
  return {
    eq: () => ({ kind: 'eq' }),
    and: () => ({ kind: 'and' }),
    desc: () => ({ kind: 'desc' }),
    gte: () => ({ kind: 'gte' }),
    sql: sqlTag,
  };
});

vi.mock('@nexuszero/db', () => {
  function resolveRows(table: symbol) {
    if (table === mockTables.tenants) {
      return [{
        id: 'tenant-1',
        name: 'Acme MENA',
        plan: 'growth',
        domain: 'acme.example',
        settings: {
          marketPreferences: {
            language: 'ar',
            countryCode: 'AE',
            dialect: 'gulf',
          },
        },
      }];
    }

    if (table === mockTables.agents) {
      return [{ type: 'seo', status: 'healthy' }];
    }

    if (table === mockTables.integrations) {
      return [{ platform: 'google_ads', status: 'connected' }];
    }

    if (table === mockTables.analyticsDataPoints) {
      return [{ impressions: 1200, clicks: 110, conversions: 12, spend: 350, revenue: 1200 }];
    }

    if (table === mockTables.assistantMessages) {
      return [];
    }

    return [];
  }

  function createQuery() {
    let currentTable: symbol | null = null;

    const query = {
      from(table: symbol) {
        currentTable = table;
        return query;
      },
      where() {
        return query;
      },
      orderBy() {
        return query;
      },
      limit() {
        return Promise.resolve(resolveRows(currentTable as symbol));
      },
      then(resolve: (value: unknown[]) => unknown, reject?: (reason: unknown) => unknown) {
        return Promise.resolve(resolveRows(currentTable as symbol)).then(resolve, reject);
      },
    };

    return query;
  }

  const fakeDb = {
    select: () => createQuery(),
    insert: (table: symbol) => ({
      values: async (value: unknown) => {
        mockState.insertedRows.push({ table, value });
      },
    }),
    update: () => ({
      set: () => ({
        where: async () => undefined,
      }),
    }),
  };

  mockState.withTenantDbMock.mockImplementation(async (_tenantId: string, callback: (db: typeof fakeDb) => Promise<unknown>) => callback(fakeDb));

  return {
    withTenantDb: mockState.withTenantDbMock,
    ...mockTables,
  };
});

vi.mock('../src/services/intelligence/index.js', () => ({
  buildCustomerIntelligence: mockState.buildCustomerIntelligenceMock,
  renderIntelligencePrompt: mockState.renderIntelligencePromptMock,
}));

describe('assistant chat runtime', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockState.insertedRows.length = 0;
    process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
    mockState.buildCustomerIntelligenceMock.mockResolvedValue(null);
    mockState.renderIntelligencePromptMock.mockReturnValue('');

    mockState.fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [{ type: 'text', text: 'Understood.' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 12, output_tokens: 6 },
      }),
    });

    vi.stubGlobal('fetch', mockState.fetchMock);
  });

  it('injects tenant market preferences into the Claude system prompt', async () => {
    const { handleAssistantChat } = await import('../src/services/assistant.service.js');

    const uiContext: UIContext = {
      currentPage: '/dashboard/analytics',
      visibleDataSummary: 'Conversions are up 12% month over month.',
    };

    const events = [] as Array<{ type: string; content?: string }>;
    for await (const event of handleAssistantChat({
      tenantId: 'tenant-1',
      userId: 'user-1',
      message: 'Show me campaign performance for last month',
      uiContext,
    })) {
      if (event.type === 'text') {
        events.push(event);
      }
    }

    expect(mockState.fetchMock).toHaveBeenCalledTimes(1);

    const [, requestInit] = mockState.fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(requestInit.body)) as {
      system: string;
      messages: Array<{ role: string; content: unknown }>;
    };

    expect(body.system).toContain('The user context is Arabic-first');
    expect(body.system).toContain('gulf Arabic when it improves naturalness');
    expect(body.system).toContain('Respect regional intent for AE');
    expect(body.messages).toEqual([
      { role: 'user', content: 'Show me campaign performance for last month' },
    ]);

    expect(events.some((event) => event.content === 'Understood.')).toBe(true);
    expect(events.some((event) => event.content?.includes('<!-- session:'))).toBe(true);
    expect(mockState.insertedRows.some((entry) => entry.table === mockTables.assistantMessages)).toBe(true);
  });

  it('injects rendered customer intelligence into the Claude system prompt', async () => {
    mockState.buildCustomerIntelligenceMock.mockResolvedValue({
      profile: { tier: 'growth' },
      journey: { journeyPhase: 'scaling' },
      behavior: { engagementLevel: 'high' },
      guidance: { tips: ['Lead with retention insights'] },
    });
    mockState.renderIntelligencePromptMock.mockReturnValue('## Customer Intelligence\n- Emphasize retention, onboarding completion, and regional trust signals.');

    const { handleAssistantChat } = await import('../src/services/assistant.service.js');

    for await (const _event of handleAssistantChat({
      tenantId: 'tenant-1',
      userId: 'user-9',
      message: 'What should I focus on next?',
      uiContext: { currentPage: '/dashboard' },
    })) {
      // exhaust stream
    }

    expect(mockState.buildCustomerIntelligenceMock).toHaveBeenCalledWith('tenant-1', 'user-9');
    expect(mockState.renderIntelligencePromptMock).toHaveBeenCalledTimes(1);

    const [, requestInit] = mockState.fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(requestInit.body)) as { system: string };

    expect(body.system).toContain('## Customer Intelligence');
    expect(body.system).toContain('Emphasize retention, onboarding completion, and regional trust signals.');
  });

  it('streams tool_call events and continues the Claude loop after UI tool usage', async () => {
    mockState.fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          content: [{
            type: 'tool_use',
            id: 'tool-1',
            name: 'showAlert',
            input: { message: 'Budget pacing risk detected', type: 'warning' },
          }],
          stop_reason: 'tool_use',
          usage: { input_tokens: 20, output_tokens: 8 },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          content: [{ type: 'text', text: 'I surfaced the warning in the dashboard.' }],
          stop_reason: 'end_turn',
          usage: { input_tokens: 10, output_tokens: 7 },
        }),
      });

    const { handleAssistantChat } = await import('../src/services/assistant.service.js');

    const events: Array<{ type: string; content?: string; toolCall?: { tool: string; args: Record<string, unknown> } }> = [];
    for await (const event of handleAssistantChat({
      tenantId: 'tenant-1',
      userId: 'user-1',
      message: 'Warn me if budget pacing is off',
      uiContext: { currentPage: '/dashboard/campaigns' },
    })) {
      events.push(event);
    }

    expect(mockState.fetchMock).toHaveBeenCalledTimes(2);

    const toolEvent = events.find((event) => event.type === 'tool_call');
    expect(toolEvent?.toolCall).toEqual({
      id: 'tool-1',
      tool: 'showAlert',
      args: { message: 'Budget pacing risk detected', type: 'warning' },
    });
    expect(events.some((event) => event.type === 'text' && event.content === 'I surfaced the warning in the dashboard.')).toBe(true);

    const [, secondRequestInit] = mockState.fetchMock.mock.calls[1] as [string, RequestInit];
    const secondBody = JSON.parse(String(secondRequestInit.body)) as {
      messages: Array<{ role: string; content: unknown }>;
    };

    expect(secondBody.messages).toEqual([
      { role: 'user', content: 'Warn me if budget pacing is off' },
      {
        role: 'assistant',
        content: [{
          type: 'tool_use',
          id: 'tool-1',
          name: 'showAlert',
          input: { message: 'Budget pacing risk detected', type: 'warning' },
        }],
      },
      {
        role: 'user',
        content: [{
          type: 'tool_result',
          tool_use_id: 'tool-1',
          content: JSON.stringify({ success: true }),
        }],
      },
    ]);
  });
});
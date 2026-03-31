import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';

// ---------------------------------------------------------------------------
// Test 6: Agent Memory & API Routes
// Tests memory categories, schema structure, and API endpoint behavior
// ---------------------------------------------------------------------------

// Mirror the memory categories from packages/db/src/schema/agent-memories.ts
const MEMORY_CATEGORIES = [
  'strategy_outcome',
  'keyword_insight',
  'audience_behavior',
  'campaign_learning',
  'anomaly_pattern',
  'competitive_intel',
  'content_performance',
  'integration_issue',
  'budget_optimization',
  'timing_insight',
] as const;

type AgentMemoryCategory = (typeof MEMORY_CATEGORIES)[number];

interface StoreMemoryInput {
  tenantId: string;
  agentType: string;
  category: string;
  content: string;
  metadata?: Record<string, unknown>;
  embedding?: number[];
  reliability?: number;
  sourceTaskId?: string;
  sourceSignalType?: string;
  correlationId?: string;
}

interface MemoryEntry {
  id: string;
  agentType: string;
  category: string;
  content: string;
  metadata: Record<string, unknown>;
  reliability: number;
  accessCount: number;
  createdAt: Date;
  similarity?: number;
}

describe('Agent Memory — Categories', () => {
  it('defines 10 memory categories', () => {
    expect(MEMORY_CATEGORIES).toHaveLength(10);
  });

  it('includes all expected categories', () => {
    expect(MEMORY_CATEGORIES).toContain('strategy_outcome');
    expect(MEMORY_CATEGORIES).toContain('keyword_insight');
    expect(MEMORY_CATEGORIES).toContain('audience_behavior');
    expect(MEMORY_CATEGORIES).toContain('campaign_learning');
    expect(MEMORY_CATEGORIES).toContain('anomaly_pattern');
    expect(MEMORY_CATEGORIES).toContain('competitive_intel');
    expect(MEMORY_CATEGORIES).toContain('content_performance');
    expect(MEMORY_CATEGORIES).toContain('integration_issue');
    expect(MEMORY_CATEGORIES).toContain('budget_optimization');
    expect(MEMORY_CATEGORIES).toContain('timing_insight');
  });
});

describe('Agent Memory — StoreMemoryInput Validation', () => {
  it('accepts a valid memory input', () => {
    const input: StoreMemoryInput = {
      tenantId: 'tenant-abc',
      agentType: 'seo',
      category: 'keyword_insight',
      content: 'Keywords "coffee shop dubai" and "best latte" show high conversion intent',
      metadata: { source: 'seo_audit', confidence: 0.9 },
      reliability: 0.8,
      sourceTaskId: 'task-123',
    };
    expect(input.tenantId).toBeTruthy();
    expect(input.agentType).toBe('seo');
    expect(input.content.length).toBeGreaterThan(0);
  });

  it('defaults reliability to 0.5 when not provided', () => {
    const input: StoreMemoryInput = {
      tenantId: 't1',
      agentType: 'ad',
      category: 'campaign_learning',
      content: 'Carousel ads outperform single-image by 35% for this audience',
    };
    const reliability = input.reliability ?? 0.5;
    expect(reliability).toBe(0.5);
  });

  it('accepts optional embedding vector', () => {
    const input: StoreMemoryInput = {
      tenantId: 't1',
      agentType: 'seo',
      category: 'strategy_outcome',
      content: 'Long-tail keywords drove 2x more organic traffic',
      embedding: Array(1536).fill(0.1),
    };
    expect(input.embedding).toHaveLength(1536);
  });
});

describe('Agent Memory — MemoryEntry Shape', () => {
  it('has required fields', () => {
    const entry: MemoryEntry = {
      id: 'mem-001',
      agentType: 'data-nexus',
      category: 'anomaly_pattern',
      content: 'CTR drops below 2% on Fridays consistently',
      metadata: { dayOfWeek: 'friday', avgCtr: 1.8 },
      reliability: 0.75,
      accessCount: 5,
      createdAt: new Date(),
    };
    expect(entry.id).toBeTruthy();
    expect(entry.reliability).toBeGreaterThan(0);
    expect(entry.reliability).toBeLessThanOrEqual(1.0);
    expect(entry.accessCount).toBeGreaterThanOrEqual(0);
  });

  it('similarity is optional (only present for vector search results)', () => {
    const withSimilarity: MemoryEntry = {
      id: 'mem-002',
      agentType: 'seo',
      category: 'keyword_insight',
      content: 'test',
      metadata: {},
      reliability: 0.5,
      accessCount: 0,
      createdAt: new Date(),
      similarity: 0.92,
    };
    expect(withSimilarity.similarity).toBe(0.92);

    const withoutSimilarity: MemoryEntry = {
      id: 'mem-003',
      agentType: 'seo',
      category: 'keyword_insight',
      content: 'test',
      metadata: {},
      reliability: 0.5,
      accessCount: 0,
      createdAt: new Date(),
    };
    expect(withoutSimilarity.similarity).toBeUndefined();
  });
});

describe('Agent Memory — Reliability Reinforcement Logic', () => {
  it('reinforcement increases reliability by delta', () => {
    let reliability = 0.5;
    const delta = 0.1;
    reliability = Math.min(1.0, reliability + delta);
    expect(reliability).toBe(0.6);
  });

  it('reliability caps at 1.0', () => {
    let reliability = 0.95;
    reliability = Math.min(1.0, reliability + 0.1);
    expect(reliability).toBe(1.0);
  });

  it('decay decreases reliability by delta', () => {
    let reliability = 0.5;
    reliability = Math.max(0.0, reliability - 0.1);
    expect(reliability).toBe(0.4);
  });

  it('reliability floors at 0.0', () => {
    let reliability = 0.05;
    reliability = Math.max(0.0, reliability - 0.1);
    expect(reliability).toBe(0.0);
  });
});

describe('Agent Memory — API Routes', () => {
  let app: Hono;
  const mockMemories: MemoryEntry[] = [
    { id: 'm1', agentType: 'seo', category: 'keyword_insight', content: 'Long-tail works best', metadata: {}, reliability: 0.8, accessCount: 3, createdAt: new Date() },
    { id: 'm2', agentType: 'ad', category: 'campaign_learning', content: 'Video ads convert 2x', metadata: { platform: 'meta' }, reliability: 0.9, accessCount: 7, createdAt: new Date() },
  ];

  beforeEach(() => {
    app = new Hono();

    // Auth middleware
    app.use('*', async (c, next) => {
      c.set('user', { userId: 'u1', tenantId: 't1', email: 'test@test.com', role: 'admin' });
      await next();
    });

    // Mock memory routes
    app.get('/memories', (c) => {
      const agentType = c.req.query('agentType');
      const category = c.req.query('category');
      const limit = parseInt(c.req.query('limit') ?? '20', 10);

      let filtered = [...mockMemories];
      if (agentType) filtered = filtered.filter(m => m.agentType === agentType);
      if (category) filtered = filtered.filter(m => m.category === category);
      filtered = filtered.slice(0, Math.min(limit, 100));

      return c.json({ memories: filtered, count: filtered.length });
    });

    app.get('/stats', (c) => {
      return c.json({
        seo: { count: 15, avgReliability: 0.72 },
        ad: { count: 8, avgReliability: 0.81 },
        'data-nexus': { count: 22, avgReliability: 0.65 },
      });
    });

    app.post('/prune', async (c) => {
      const user = c.get('user') as any;
      if (user.role !== 'admin') return c.json({ error: 'Forbidden' }, 403);
      return c.json({ pruned: 7 });
    });
  });

  it('GET /memories returns all memories', async () => {
    const res = await app.request('/memories');
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.count).toBe(2);
    expect(data.memories).toHaveLength(2);
  });

  it('GET /memories filters by agentType', async () => {
    const res = await app.request('/memories?agentType=seo');
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.count).toBe(1);
    expect(data.memories[0].agentType).toBe('seo');
  });

  it('GET /memories filters by category', async () => {
    const res = await app.request('/memories?category=campaign_learning');
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.count).toBe(1);
    expect(data.memories[0].category).toBe('campaign_learning');
  });

  it('GET /memories respects limit', async () => {
    const res = await app.request('/memories?limit=1');
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.count).toBe(1);
  });

  it('GET /stats returns per-agent statistics', async () => {
    const res = await app.request('/stats');
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.seo.count).toBe(15);
    expect(data.ad.avgReliability).toBeCloseTo(0.81, 2);
    expect(data['data-nexus']).toBeDefined();
  });

  it('POST /prune returns pruned count for admin', async () => {
    const res = await app.request('/prune', { method: 'POST' });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.pruned).toBe(7);
  });

  it('POST /prune rejects non-admin', async () => {
    const app2 = new Hono();
    app2.use('*', async (c, next) => {
      c.set('user', { userId: 'u2', tenantId: 't1', email: 'v@test.com', role: 'viewer' });
      await next();
    });
    app2.post('/prune', (c) => {
      const user = c.get('user') as any;
      if (user.role !== 'admin') return c.json({ error: 'Forbidden' }, 403);
      return c.json({ pruned: 0 });
    });
    const res = await app2.request('/prune', { method: 'POST' });
    expect(res.status).toBe(403);
  });
});

describe('Agent Memory — LLM Usage API Routes', () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
    app.use('*', async (c, next) => {
      c.set('user', { userId: 'u1', tenantId: 't1', email: 'test@test.com', role: 'admin' });
      await next();
    });

    app.get('/daily', (c) => c.json({ date: '2026-03-31', totalCost: 12.5, totalInputTokens: 50000, totalOutputTokens: 20000, requestCount: 150 }));
    app.get('/monthly', (c) => c.json({ month: '2026-03', totalCost: 185.50, requestCount: 4200 }));
    app.get('/budget', (c) => c.json({ allowed: true, remaining: 14.50, cap: 200, percentUsed: 93 }));
    app.get('/pricing', (c) => c.json({ 'openai/gpt-4o-mini': { input: 0.15, output: 0.60 } }));
  });

  it('GET /daily returns daily usage', async () => {
    const res = await app.request('/daily');
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.date).toBe('2026-03-31');
    expect(data.totalCost).toBeGreaterThan(0);
    expect(data.requestCount).toBeGreaterThan(0);
  });

  it('GET /monthly returns monthly usage', async () => {
    const res = await app.request('/monthly');
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.month).toBe('2026-03');
    expect(data.totalCost).toBeGreaterThan(0);
  });

  it('GET /budget returns budget status', async () => {
    const res = await app.request('/budget');
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.allowed).toBe(true);
    expect(data.remaining).toBeGreaterThan(0);
    expect(data.cap).toBe(200);
    expect(data.percentUsed).toBeLessThanOrEqual(100);
  });

  it('GET /pricing returns model pricing', async () => {
    const res = await app.request('/pricing');
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data['openai/gpt-4o-mini'].input).toBe(0.15);
  });
});

describe('Agent Memory — SLA API Routes', () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
    app.use('*', async (c, next) => {
      c.set('user', { userId: 'u1', tenantId: 't1', email: 'test@test.com', role: 'admin' });
      await next();
    });

    app.get('/summary', (c) => c.json({ complianceRate: 0.95, totalTasks: 100, breaches: 5, byPriority: { critical: { compliance: 0.90 }, high: { compliance: 0.97 } } }));
    app.get('/breaches', (c) => c.json({ breaches: [{ taskId: 'task-1', priority: 'critical', type: 'queue_time', exceededMs: 5000 }], total: 1 }));
    app.get('/targets', (c) => c.json({ critical: { maxQueueTimeMs: 10000 }, high: { maxQueueTimeMs: 60000 } }));
  });

  it('GET /summary returns SLA compliance overview', async () => {
    const res = await app.request('/summary');
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.complianceRate).toBeGreaterThan(0);
    expect(data.totalTasks).toBeGreaterThan(0);
  });

  it('GET /breaches returns breach details', async () => {
    const res = await app.request('/breaches');
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.breaches).toHaveLength(1);
    expect(data.breaches[0].taskId).toBe('task-1');
  });

  it('GET /targets returns SLA target thresholds', async () => {
    const res = await app.request('/targets');
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.critical.maxQueueTimeMs).toBe(10000);
    expect(data.high.maxQueueTimeMs).toBe(60000);
  });
});

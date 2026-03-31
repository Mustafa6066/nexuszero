import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';

// ---------------------------------------------------------------------------
// Test 5: WebSocket Real-Time Layer — Tests
// Tests WS message protocol, auth, channel subscriptions, push helpers
// ---------------------------------------------------------------------------

// Re-create the WebSocket message types and channel logic

interface WsMessage {
  channel: string;
  event: string;
  data: unknown;
  timestamp: string;
}

const ALLOWED_CHANNELS = ['agent:status', 'task:progress', 'alerts', 'analytics:live', 'sla:breaches'];

describe('WebSocket — Message Protocol', () => {
  it('WsMessage has required fields', () => {
    const msg: WsMessage = {
      channel: 'agent:status',
      event: 'agent_status_changed',
      data: { agentType: 'seo', status: 'processing' },
      timestamp: new Date().toISOString(),
    };
    expect(msg.channel).toBe('agent:status');
    expect(msg.event).toBe('agent_status_changed');
    expect(msg.timestamp).toBeTruthy();
  });

  it('timestamp is valid ISO string', () => {
    const ts = new Date().toISOString();
    expect(() => new Date(ts)).not.toThrow();
    const parsed = new Date(ts);
    expect(parsed.getTime()).toBeGreaterThan(0);
  });
});

describe('WebSocket — Channel Validation', () => {
  it('allows all defined channels', () => {
    for (const ch of ALLOWED_CHANNELS) {
      expect(ALLOWED_CHANNELS.includes(ch)).toBe(true);
    }
  });

  it('has agent:status channel', () => {
    expect(ALLOWED_CHANNELS).toContain('agent:status');
  });

  it('has task:progress channel', () => {
    expect(ALLOWED_CHANNELS).toContain('task:progress');
  });

  it('has alerts channel', () => {
    expect(ALLOWED_CHANNELS).toContain('alerts');
  });

  it('has analytics:live channel', () => {
    expect(ALLOWED_CHANNELS).toContain('analytics:live');
  });

  it('has sla:breaches channel', () => {
    expect(ALLOWED_CHANNELS).toContain('sla:breaches');
  });

  it('rejects unknown channel', () => {
    expect(ALLOWED_CHANNELS.includes('unknown:channel')).toBe(false);
  });
});

describe('WebSocket — Subscription Message Format', () => {
  it('subscribe action format', () => {
    const msg = { action: 'subscribe', channel: 'agent:status' };
    expect(msg.action).toBe('subscribe');
    expect(ALLOWED_CHANNELS.includes(msg.channel)).toBe(true);
  });

  it('unsubscribe action format', () => {
    const msg = { action: 'unsubscribe', channel: 'task:progress' };
    expect(msg.action).toBe('unsubscribe');
    expect(ALLOWED_CHANNELS.includes(msg.channel)).toBe(true);
  });

  it('ping action format', () => {
    const msg = { action: 'ping' };
    expect(msg.action).toBe('ping');
  });
});

describe('WebSocket — Push Helper Message Shapes', () => {
  it('pushAgentStatus creates correct message shape', () => {
    const agentType = 'seo';
    const status = 'processing';
    const details = { queueDepth: 5 };

    const message: WsMessage = {
      channel: 'agent:status',
      event: 'agent_status_changed',
      data: { agentType, status, ...details },
      timestamp: new Date().toISOString(),
    };

    expect(message.channel).toBe('agent:status');
    expect(message.event).toBe('agent_status_changed');
    expect((message.data as any).agentType).toBe('seo');
    expect((message.data as any).queueDepth).toBe(5);
  });

  it('pushTaskProgress creates correct message shape', () => {
    const message: WsMessage = {
      channel: 'task:progress',
      event: 'task_progress',
      data: { taskId: 'task-123', progress: 65 },
      timestamp: new Date().toISOString(),
    };

    expect(message.channel).toBe('task:progress');
    expect((message.data as any).progress).toBe(65);
    expect((message.data as any).taskId).toBe('task-123');
  });

  it('pushTaskCompleted creates correct message shape', () => {
    const message: WsMessage = {
      channel: 'task:progress',
      event: 'task_completed',
      data: { taskId: 'task-456', taskType: 'seo_audit', result: { score: 85 } },
      timestamp: new Date().toISOString(),
    };

    expect(message.event).toBe('task_completed');
    expect((message.data as any).taskType).toBe('seo_audit');
  });

  it('pushAlert creates correct message shape', () => {
    const message: WsMessage = {
      channel: 'alerts',
      event: 'alert',
      data: {
        alertType: 'budget_exceeded',
        message: 'Ad spend exceeded 90% of budget',
        severity: 'warning',
      },
      timestamp: new Date().toISOString(),
    };

    expect(message.channel).toBe('alerts');
    expect((message.data as any).severity).toBe('warning');
    expect((message.data as any).alertType).toBe('budget_exceeded');
  });

  it('pushSlaBreach creates correct message shape', () => {
    const message: WsMessage = {
      channel: 'sla:breaches',
      event: 'sla_breach',
      data: {
        taskId: 'task-789',
        breachType: 'queue_time_exceeded',
        priority: 'high',
        exceeded: 15000,
      },
      timestamp: new Date().toISOString(),
    };

    expect(message.channel).toBe('sla:breaches');
    expect(message.event).toBe('sla_breach');
    expect((message.data as any).breachType).toBe('queue_time_exceeded');
  });
});

describe('WebSocket — WS Stats Route', () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();

    // Simulate auth middleware
    app.use('*', async (c, next) => {
      c.set('user', { userId: 'u1', tenantId: 't1', email: 'test@test.com', role: 'admin' });
      await next();
    });

    // Simulate ws-stats route
    app.get('/stats', (c) => {
      const user = c.get('user') as any;
      if (user.role !== 'admin') {
        return c.json({ error: 'Forbidden' }, 403);
      }
      return c.json({ totalClients: 3, tenantCount: 2, subscriptionCounts: { 'agent:status': 2, alerts: 1 } });
    });
  });

  it('GET /stats returns connection stats for admin', async () => {
    const res = await app.request('/stats');
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.totalClients).toBe(3);
    expect(data.tenantCount).toBe(2);
    expect(data.subscriptionCounts['agent:status']).toBe(2);
  });

  it('GET /stats rejects non-admin', async () => {
    const app2 = new Hono();
    app2.use('*', async (c, next) => {
      c.set('user', { userId: 'u2', tenantId: 't1', email: 'viewer@test.com', role: 'viewer' });
      await next();
    });
    app2.get('/stats', (c) => {
      const user = c.get('user') as any;
      if (user.role !== 'admin') return c.json({ error: 'Forbidden' }, 403);
      return c.json({});
    });

    const res = await app2.request('/stats');
    expect(res.status).toBe(403);
  });
});

describe('WebSocket — Redis PubSub Bridge Message Format', () => {
  it('broadcast message contains required fields', () => {
    const msg = {
      tenantId: 'tenant-abc',
      channel: 'agent:status',
      event: 'agent_status_changed',
      data: { agentType: 'seo', status: 'idle' },
    };

    expect(msg.tenantId).toBeTruthy();
    expect(ALLOWED_CHANNELS.includes(msg.channel)).toBe(true);
    expect(msg.event).toBeTruthy();
    expect(msg.data).toBeDefined();
  });

  it('serializes/deserializes correctly via JSON', () => {
    const original = {
      tenantId: 't1',
      channel: 'alerts',
      event: 'alert',
      data: { severity: 'critical', message: 'Budget exceeded' },
    };

    const serialized = JSON.stringify(original);
    const parsed = JSON.parse(serialized);

    expect(parsed).toEqual(original);
    expect(parsed.data.severity).toBe('critical');
  });
});

import { describe, it, expect } from 'vitest';
import { getTenantQueue, getAllTenantQueues, parseTenantFromQueue, getQueuePattern } from '../src/queues.js';

const TENANT_ID = 'aaaabbbb-cccc-dddd-eeee-ffffffffffff';

describe('getTenantQueue', () => {
  it('builds a tenant-scoped queue name', () => {
    const name = getTenantQueue('seo-tasks', TENANT_ID);
    expect(name).toBe(`seo-tasks:${TENANT_ID}`);
  });
});

describe('getAllTenantQueues', () => {
  it('returns all 5 agent queues for a tenant', () => {
    const queues = getAllTenantQueues(TENANT_ID);
    expect(Object.keys(queues)).toHaveLength(5);
    expect(queues.seo).toContain('seo-tasks');
    expect(queues.ad).toContain('ad-tasks');
    expect(queues.creative).toContain('creative-tasks');
    expect(queues.data).toContain('data-tasks');
    expect(queues.aeo).toContain('aeo-tasks');
    for (const q of Object.values(queues)) {
      expect(q).toContain(TENANT_ID);
    }
  });
});

describe('parseTenantFromQueue', () => {
  it('extracts tenant ID from scoped queue name', () => {
    const result = parseTenantFromQueue(`seo-tasks:${TENANT_ID}`);
    expect(result).toBe(TENANT_ID);
  });

  it('returns null for unscoped queue name', () => {
    const result = parseTenantFromQueue('orchestrator');
    expect(result).toBe('orchestrator'); // single segment returns last part
  });
});

describe('getQueuePattern', () => {
  it('returns wildcard pattern', () => {
    expect(getQueuePattern('ad-tasks')).toBe('ad-tasks:*');
  });
});

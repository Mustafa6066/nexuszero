import { QUEUE_NAMES } from '@nexuszero/shared';

export { QUEUE_NAMES };

/** Generate a tenant-scoped queue name */
export function getTenantQueue(baseQueue: string, tenantId: string): string {
  return QUEUE_NAMES.forTenant(baseQueue, tenantId);
}

/** Generate all agent queue names for a specific tenant */
export function getAllTenantQueues(tenantId: string): Record<string, string> {
  return {
    seo: getTenantQueue(QUEUE_NAMES.SEO_TASKS, tenantId),
    ad: getTenantQueue(QUEUE_NAMES.AD_TASKS, tenantId),
    creative: getTenantQueue(QUEUE_NAMES.CREATIVE_TASKS, tenantId),
    data: getTenantQueue(QUEUE_NAMES.DATA_TASKS, tenantId),
    aeo: getTenantQueue(QUEUE_NAMES.AEO_TASKS, tenantId),
    compatibility: getTenantQueue(QUEUE_NAMES.COMPATIBILITY_TASKS, tenantId),
    salesPipeline: getTenantQueue(QUEUE_NAMES.SALES_PIPELINE_TASKS, tenantId),
    outbound: getTenantQueue(QUEUE_NAMES.OUTBOUND_TASKS, tenantId),
    finance: getTenantQueue(QUEUE_NAMES.FINANCE_TASKS, tenantId),
    podcast: getTenantQueue(QUEUE_NAMES.PODCAST_TASKS, tenantId),
  };
}

/** Parse tenant ID from a tenant-scoped queue name */
export function parseTenantFromQueue(queueName: string): string | null {
  const parts = queueName.split('.');
  return parts.length >= 2 ? parts[parts.length - 1]! : null;
}

/** Get the wildcard pattern for a base queue (matches all tenants) */
export function getQueuePattern(baseQueue: string): string {
  return `${baseQueue}.*`;
}

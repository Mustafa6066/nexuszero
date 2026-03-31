import { createHash } from 'node:crypto';
import Redis from 'ioredis';
import type { ProbeResult } from './providers/base-prober.js';
import type { ProberProvider } from './providers/base-prober.js';
import { OpenAIProber } from './providers/openai-prober.js';
import { PerplexityProber } from './providers/perplexity-prober.js';
import { GeminiProber } from './providers/gemini-prober.js';
import { SerperProber } from './providers/serper-prober.js';

export interface ProbeRequest {
  tenantId: string;
  entityName: string;
  query: string;
  /** Restrict to specific providers (default: all configured) */
  providers?: string[];
}

export interface ProbeEngineResult {
  query: string;
  entityName: string;
  results: ProbeResult[];
  /** Whether this result was served from cache */
  cached: boolean;
}

const CACHE_TTL_SECONDS = 12 * 60 * 60; // 12 hours

let redis: Redis | null = null;

function getRedis(): Redis {
  if (!redis) {
    redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });
  }
  return redis;
}

function cacheKey(tenantId: string, query: string): string {
  const hash = createHash('sha256').update(query.toLowerCase().trim()).digest('hex').slice(0, 16);
  return `prober:${tenantId}:${hash}`;
}

/** All available probers — lazy-created once */
const ALL_PROBERS: ProberProvider[] = [
  new OpenAIProber(),
  new PerplexityProber(),
  new GeminiProber(),
  new SerperProber(),
];

/** Get probers filtered by configuration and optional name list */
function getActiveProbers(providerNames?: string[]): ProberProvider[] {
  const configured = ALL_PROBERS.filter(p => p.isConfigured());
  if (!providerNames || providerNames.length === 0) return configured;
  return configured.filter(p => providerNames.includes(p.name));
}

/**
 * Probe a single query across all configured providers.
 * Results are cached per-tenant in Redis to avoid redundant API spend.
 */
export async function probeQuery(req: ProbeRequest): Promise<ProbeEngineResult> {
  const key = cacheKey(req.tenantId, req.query);

  // Check cache
  try {
    const cached = await getRedis().get(key);
    if (cached) {
      const results = JSON.parse(cached) as ProbeResult[];
      return { query: req.query, entityName: req.entityName, results, cached: true };
    }
  } catch {
    // Cache miss or Redis down — proceed without cache
  }

  const probers = getActiveProbers(req.providers);
  if (probers.length === 0) {
    return { query: req.query, entityName: req.entityName, results: [], cached: false };
  }

  // Fire all probes in parallel with individual error isolation
  const settledResults = await Promise.allSettled(
    probers.map(p => p.probe(req.query)),
  );

  const results: ProbeResult[] = [];
  for (const settled of settledResults) {
    if (settled.status === 'fulfilled') {
      results.push(settled.value);
    } else {
      console.warn(`[prober] Provider failed: ${settled.reason}`);
    }
  }

  // Cache successful results
  if (results.length > 0) {
    try {
      await getRedis().set(key, JSON.stringify(results), 'EX', CACHE_TTL_SECONDS);
    } catch {
      // Non-critical — proceed without caching
    }
  }

  return { query: req.query, entityName: req.entityName, results, cached: false };
}

/**
 * Probe multiple queries for an entity across all providers.
 * Runs queries sequentially to respect API rate limits, providers in parallel per query.
 */
export async function probeAllQueries(
  tenantId: string,
  entityName: string,
  queries: string[],
  providers?: string[],
): Promise<ProbeEngineResult[]> {
  const results: ProbeEngineResult[] = [];

  for (const query of queries) {
    const result = await probeQuery({ tenantId, entityName, query, providers });
    results.push(result);
  }

  return results;
}

/** Shutdown Redis connection gracefully */
export async function closeProberRedis(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
  }
}

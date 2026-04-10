/**
 * Circuit State Manager — Manages connector circuit breaker states from
 * the healing layer. Allows resetting circuits after issues are resolved.
 * Persists circuit states to Redis and emits WS events on state changes.
 */

import type { Platform } from '@nexuszero/shared';
import { getRedisConnection, createLogger } from '@nexuszero/shared';
import { publishWsEvent } from '@nexuszero/queue';
import { getConnector, getAllConnectors, hasConnector } from '../connectors/connector-registry.js';

const log = createLogger('circuit-state-manager');
const REDIS_KEY_PREFIX = 'circuit:state:';

export interface CircuitStatus {
  platform: Platform;
  state: 'closed' | 'open' | 'half-open';
  failureCount: number;
}

/** Persist circuit state to Redis */
async function persistState(platform: Platform, status: CircuitStatus): Promise<void> {
  try {
    const redis = getRedisConnection();
    await redis.set(`${REDIS_KEY_PREFIX}${platform}`, JSON.stringify(status), 'EX', 3600);
  } catch (err) {
    log.warn('Failed to persist circuit state to Redis', { platform, error: (err as Error).message });
  }
}

/** Emit circuit state change via WS for admin visibility */
async function emitStateChange(tenantId: string, platform: Platform, status: CircuitStatus): Promise<void> {
  try {
    await publishWsEvent(tenantId, 'agent:status', 'circuit_state_changed', {
      platform,
      state: status.state,
      failureCount: status.failureCount,
    });
  } catch (err) {
    log.warn('Failed to emit circuit state WS event', { platform, error: (err as Error).message });
  }
}

export interface CircuitStatus {
  platform: Platform;
  state: 'closed' | 'open' | 'half-open';
  failureCount: number;
}

/** Get the circuit breaker status for a specific connector */
export function getCircuitStatus(platform: Platform): CircuitStatus | null {
  if (!hasConnector(platform)) return null;
  const connector = getConnector(platform);
  const circuitState = connector.getCircuitState();
  const status: CircuitStatus = {
    platform,
    state: circuitState,
    failureCount: 0,
  };
  persistState(platform, status);
  return status;
}

/** Get circuit statuses for all registered connectors */
export function getAllCircuitStatuses(): CircuitStatus[] {
  const statuses: CircuitStatus[] = [];
  for (const [platform, connector] of getAllConnectors()) {
    const circuitState = connector.getCircuitState();
    statuses.push({
      platform: platform as Platform,
      state: circuitState,
      failureCount: 0,
    });
  }
  return statuses;
}

/** Reset circuit breaker for a connector after manual/auto healing */
export function resetCircuit(platform: Platform, tenantId?: string): boolean {
  if (!hasConnector(platform)) return false;
  const connector = getConnector(platform);
  connector.resetCircuit();
  const status: CircuitStatus = { platform, state: 'closed', failureCount: 0 };
  persistState(platform, status);
  if (tenantId) {
    emitStateChange(tenantId, platform, status);
  }
  return true;
}

/** Get all platforms with open (tripped) circuits */
export function getTrippedCircuits(): CircuitStatus[] {
  return getAllCircuitStatuses().filter((s) => s.state === 'open');
}

/** Reset all tripped circuits — use after a global remediation event */
export function resetAllTrippedCircuits(): Platform[] {
  const tripped = getTrippedCircuits();
  const resetPlatforms: Platform[] = [];
  for (const status of tripped) {
    resetCircuit(status.platform);
    resetPlatforms.push(status.platform);
  }
  return resetPlatforms;
}

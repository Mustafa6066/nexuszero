/**
 * Circuit State Manager — Manages connector circuit breaker states from
 * the healing layer. Allows resetting circuits after issues are resolved.
 */

import type { Platform } from '@nexuszero/shared';
import { getConnector, getAllConnectors, hasConnector } from '../connectors/connector-registry.js';

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
  return {
    platform,
    state: circuitState,
    failureCount: 0,
  };
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
export function resetCircuit(platform: Platform): boolean {
  if (!hasConnector(platform)) return false;
  const connector = getConnector(platform);
  connector.resetCircuit();
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

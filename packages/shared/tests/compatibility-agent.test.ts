import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AGENT_TYPE_DEFINITIONS, TASK_TO_AGENT_MAP, PLAN_AGENT_LIMITS } from '../src/constants/agent-types';

describe('Compatibility agent type definition', () => {
  it('exists in AGENT_TYPE_DEFINITIONS', () => {
    expect(AGENT_TYPE_DEFINITIONS.compatibility).toBeDefined();
  });

  it('has correct queue prefix', () => {
    expect(AGENT_TYPE_DEFINITIONS.compatibility.queuePrefix).toBe('compatibility-tasks');
  });

  it('has all 16 task types', () => {
    expect(AGENT_TYPE_DEFINITIONS.compatibility.taskTypes).toHaveLength(16);
  });

  it('includes key task types', () => {
    const types = AGENT_TYPE_DEFINITIONS.compatibility.taskTypes;
    expect(types).toContain('tech_stack_detection');
    expect(types).toContain('onboarding_flow');
    expect(types).toContain('oauth_connect');
    expect(types).toContain('oauth_refresh');
    expect(types).toContain('health_check');
    expect(types).toContain('auto_reconnect');
    expect(types).toContain('drift_detection');
    expect(types).toContain('schema_snapshot');
  });
});

describe('TASK_TO_AGENT_MAP includes compatibility tasks', () => {
  it('maps tech_stack_detection to compatibility', () => {
    expect(TASK_TO_AGENT_MAP['tech_stack_detection']).toBe('compatibility');
  });

  it('maps health_check to compatibility', () => {
    expect(TASK_TO_AGENT_MAP['health_check']).toBe('compatibility');
  });

  it('maps oauth_connect to compatibility', () => {
    expect(TASK_TO_AGENT_MAP['oauth_connect']).toBe('compatibility');
  });

  it('maps auto_reconnect to compatibility', () => {
    expect(TASK_TO_AGENT_MAP['auto_reconnect']).toBe('compatibility');
  });
});

describe('PLAN_AGENT_LIMITS includes compatibility', () => {
  it('launchpad allows compatibility agent', () => {
    expect(PLAN_AGENT_LIMITS.launchpad.allowedTypes).toContain('compatibility');
  });

  it('growth allows compatibility agent', () => {
    expect(PLAN_AGENT_LIMITS.growth.allowedTypes).toContain('compatibility');
  });

  it('enterprise allows compatibility agent', () => {
    expect(PLAN_AGENT_LIMITS.enterprise.allowedTypes).toContain('compatibility');
  });
});

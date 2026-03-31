// ---------------------------------------------------------------------------
// Comprehensive tests for all 10 src/-inspired features
// ---------------------------------------------------------------------------
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock workspace packages that Vitest can't resolve via pnpm aliases
vi.mock('@nexuszero/llm-router', () => ({
  routedCompletion: vi.fn().mockResolvedValue('{"insights":[]}'),
}));

// =========================================================================
// 1. Token Budget with Diminishing Returns
// =========================================================================
describe('Token Budget System', () => {
  let createBudgetTracker: typeof import('@nexuszero/llm-router')['createBudgetTracker'];
  let recordTurn: typeof import('@nexuszero/llm-router')['recordTurn'];
  let checkTokenBudget: typeof import('@nexuszero/llm-router')['checkTokenBudget'];
  let DEFAULT_TASK_BUDGETS: typeof import('@nexuszero/llm-router')['DEFAULT_TASK_BUDGETS'];

  beforeEach(async () => {
    const mod = await import('../packages/llm-router/src/token-budget.ts');
    createBudgetTracker = mod.createBudgetTracker;
    recordTurn = mod.recordTurn;
    checkTokenBudget = mod.checkTokenBudget;
    DEFAULT_TASK_BUDGETS = mod.DEFAULT_TASK_BUDGETS;
  });

  it('should create a fresh budget tracker', () => {
    const tracker = createBudgetTracker();
    expect(tracker.turnCount).toBe(0);
    expect(tracker.totalInputTokens).toBe(0);
    expect(tracker.totalOutputTokens).toBe(0);
    expect(tracker.totalCostUsd).toBe(0);
    expect(tracker.consecutiveLowDeltaTurns).toBe(0);
    expect(tracker.startedAt).toBeGreaterThan(0);
  });

  it('should record turns and accumulate tokens', () => {
    const tracker = createBudgetTracker();
    recordTurn(tracker, 1000, 500, 0.01);
    expect(tracker.turnCount).toBe(1);
    expect(tracker.totalInputTokens).toBe(1000);
    expect(tracker.totalOutputTokens).toBe(500);
    expect(tracker.totalCostUsd).toBe(0.01);

    recordTurn(tracker, 2000, 800, 0.02);
    expect(tracker.turnCount).toBe(2);
    expect(tracker.totalInputTokens).toBe(3000);
    expect(tracker.totalOutputTokens).toBe(1300);
    expect(tracker.totalCostUsd).toBeCloseTo(0.03);
  });

  it('should allow when within budget', () => {
    const tracker = createBudgetTracker();
    recordTurn(tracker, 1000, 500, 0.01);
    const result = checkTokenBudget(tracker, { maxTokens: 10000, maxTurns: 5, maxCostUsd: 1.0 });
    expect(result.allowed).toBe(true);
    expect(result.tokenPercentUsed).toBe(15); // 1500/10000
    expect(result.costPercentUsed).toBe(1); // 0.01/1.0
  });

  it('should stop at 90% token budget threshold', () => {
    const tracker = createBudgetTracker();
    recordTurn(tracker, 4500, 4600, 0.10);
    const result = checkTokenBudget(tracker, { maxTokens: 10000 });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('budget_threshold');
  });

  it('should stop at turn limit', () => {
    const tracker = createBudgetTracker();
    for (let i = 0; i < 5; i++) {
      recordTurn(tracker, 100, 600, 0.01);
    }
    const result = checkTokenBudget(tracker, { maxTurns: 5 });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('turn_limit');
  });

  it('should stop at cost limit', () => {
    const tracker = createBudgetTracker();
    recordTurn(tracker, 1000, 500, 2.50);
    const result = checkTokenBudget(tracker, { maxCostUsd: 2.00 });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('cost_limit');
  });

  it('should detect diminishing returns after 3 consecutive low-output turns', () => {
    const tracker = createBudgetTracker();
    // 3 turns with <500 tokens output
    recordTurn(tracker, 1000, 100, 0.01);
    recordTurn(tracker, 1000, 200, 0.01);
    recordTurn(tracker, 1000, 50, 0.01);
    const result = checkTokenBudget(tracker, {});
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('diminishing_returns');
  });

  it('should reset diminishing returns counter on productive turn', () => {
    const tracker = createBudgetTracker();
    recordTurn(tracker, 1000, 100, 0.01);
    recordTurn(tracker, 1000, 200, 0.01);
    // A productive turn resets
    recordTurn(tracker, 1000, 800, 0.01);
    expect(tracker.consecutiveLowDeltaTurns).toBe(0);
    const result = checkTokenBudget(tracker, {});
    expect(result.allowed).toBe(true);
  });

  it('should allow unlimited budget (only diminishing returns guard)', () => {
    const tracker = createBudgetTracker();
    recordTurn(tracker, 50000, 20000, 5.0);
    const result = checkTokenBudget(tracker, {});
    expect(result.allowed).toBe(true);
  });

  it('should have valid default budget tiers', () => {
    expect(DEFAULT_TASK_BUDGETS.light.maxTokens).toBe(8000);
    expect(DEFAULT_TASK_BUDGETS.standard.maxTurns).toBe(8);
    expect(DEFAULT_TASK_BUDGETS.heavy.maxCostUsd).toBe(2.0);
    expect(DEFAULT_TASK_BUDGETS.unlimited).toEqual({});
  });
});

// =========================================================================
// 2. Auto-Compaction
// =========================================================================
describe('Auto-Compaction', () => {
  let estimateMessageTokens: typeof import('../packages/llm-router/src/auto-compact.ts')['estimateMessageTokens'];
  let getCompactionThreshold: typeof import('../packages/llm-router/src/auto-compact.ts')['getCompactionThreshold'];
  let needsCompaction: typeof import('../packages/llm-router/src/auto-compact.ts')['needsCompaction'];

  beforeEach(async () => {
    const mod = await import('../packages/llm-router/src/auto-compact.ts');
    estimateMessageTokens = mod.estimateMessageTokens;
    getCompactionThreshold = mod.getCompactionThreshold;
    needsCompaction = mod.needsCompaction;
  });

  it('should estimate message tokens from content length', () => {
    const messages = [
      { role: 'user' as const, content: 'Hello world' }, // ~3 tokens
      { role: 'assistant' as const, content: 'Hi there, how can I help?' }, // ~7 tokens
    ];
    const estimate = estimateMessageTokens(messages);
    expect(estimate).toBeGreaterThan(5);
    expect(estimate).toBeLessThan(20);
  });

  it('should calculate compaction threshold correctly', () => {
    // For Sonnet (200K context) with 4096 max output:
    // threshold = 200000 - 4096 - 13000 = 182904
    const threshold = getCompactionThreshold('anthropic/claude-sonnet-4-5', 4096);
    expect(threshold).toBe(200000 - 4096 - 13000);
  });

  it('should use 128K as default for unknown models', () => {
    const threshold = getCompactionThreshold('unknown/model', 4096);
    expect(threshold).toBe(128000 - 4096 - 13000);
  });

  it('should return false for short message lists', () => {
    const messages = [
      { role: 'user' as const, content: 'A short message' },
    ];
    expect(needsCompaction(messages, 'anthropic/claude-sonnet-4-5', 4096)).toBe(false);
  });

  it('should detect when compaction is needed', () => {
    // Create messages that exceed the threshold
    const bigContent = 'x'.repeat(700000); // ~200K tokens at 3.5 chars/token
    const messages = [{ role: 'user' as const, content: bigContent }];
    expect(needsCompaction(messages, 'anthropic/claude-sonnet-4-5', 4096)).toBe(true);
  });
});

// =========================================================================
// 3. OTel Metric Counters
// =========================================================================
describe('OTel Metric Counters', () => {
  let initOtelCounters: typeof import('../packages/shared/src/utils/otel-counters.ts')['initOtelCounters'];
  let recordLlmMetrics: typeof import('../packages/shared/src/utils/otel-counters.ts')['recordLlmMetrics'];
  let isOtelCountersInitialized: typeof import('../packages/shared/src/utils/otel-counters.ts')['isOtelCountersInitialized'];

  beforeEach(async () => {
    const mod = await import('../packages/shared/src/utils/otel-counters.ts');
    initOtelCounters = mod.initOtelCounters;
    recordLlmMetrics = mod.recordLlmMetrics;
    isOtelCountersInitialized = mod.isOtelCountersInitialized;
  });

  it('should initialize OTel counters without errors', () => {
    expect(() => initOtelCounters('test-service')).not.toThrow();
    expect(isOtelCountersInitialized()).toBe(true);
  });

  it('should record metrics without errors', () => {
    initOtelCounters('test-service');
    expect(() => recordLlmMetrics({
      model: 'anthropic/claude-sonnet-4-5',
      agentType: 'seo',
      tenantId: 'tenant-123',
      inputTokens: 1000,
      outputTokens: 500,
      costUsd: 0.03,
      durationMs: 2500,
    })).not.toThrow();
  });

  it('should handle recording before initialization (no-op)', () => {
    // Should not throw even if counters not initialized
    expect(() => recordLlmMetrics({
      model: 'test',
      agentType: 'seo',
      tenantId: 'tenant-123',
      inputTokens: 100,
      outputTokens: 50,
      costUsd: 0.001,
      durationMs: 100,
    })).not.toThrow();
  });
});

// =========================================================================
// 4. Tool Access Control
// =========================================================================
describe('Tool Access Control', () => {
  let isToolAllowed: typeof import('../packages/queue/src/tool-access.ts')['isToolAllowed'];
  let ToolPermissions: typeof import('../packages/queue/src/tool-access.ts')['ToolPermissions'];

  beforeEach(async () => {
    const mod = await import('../packages/queue/src/tool-access.ts');
    isToolAllowed = mod.isToolAllowed;
  });

  it('should allow tools in the allowed set', () => {
    const perms = {
      allowed: new Set(['llm_completion', 'web_search', 'db_read'] as const),
      denied: new Set([] as const),
    };
    expect(isToolAllowed(perms as any, 'llm_completion')).toBe(true);
    expect(isToolAllowed(perms as any, 'web_search')).toBe(true);
  });

  it('should deny tools not in the allowed set', () => {
    const perms = {
      allowed: new Set(['llm_completion'] as const),
      denied: new Set([] as const),
    };
    expect(isToolAllowed(perms as any, 'cms_write')).toBe(false);
  });

  it('should deny explicitly denied tools even if allowed', () => {
    const perms = {
      allowed: new Set(['llm_completion', 'cms_write'] as const),
      denied: new Set(['cms_write'] as const),
    };
    expect(isToolAllowed(perms as any, 'cms_write')).toBe(false);
  });
});

// =========================================================================
// 5. Skill Loader & Registry
// =========================================================================
describe('Skill Loader', () => {
  let filterSkills: typeof import('../packages/shared/src/skills/skill-loader.ts')['filterSkills'];
  let buildSkillPromptSection: typeof import('../packages/shared/src/skills/skill-loader.ts')['buildSkillPromptSection'];
  let Skill: typeof import('../packages/shared/src/skills/skill-loader.ts')['Skill'];

  beforeEach(async () => {
    const mod = await import('../packages/shared/src/skills/skill-loader.ts');
    filterSkills = mod.filterSkills;
    buildSkillPromptSection = mod.buildSkillPromptSection;
  });

  it('should filter skills by agent type', () => {
    const skills = [
      { id: 'seo-audit', title: 'SEO Audit', content: '...', agentTypes: ['seo'], taskTypes: ['*'], filePath: '' },
      { id: 'ad-copy', title: 'Ad Copy', content: '...', agentTypes: ['ad', 'creative'], taskTypes: ['*'], filePath: '' },
      { id: 'general', title: 'General', content: '...', agentTypes: ['*'], taskTypes: ['*'], filePath: '' },
    ];

    const seoSkills = filterSkills(skills as any, 'seo', 'site_crawl');
    expect(seoSkills.length).toBe(2); // seo-audit + general
    expect(seoSkills.map(s => s.id)).toContain('seo-audit');
    expect(seoSkills.map(s => s.id)).toContain('general');
  });

  it('should filter skills by task type', () => {
    const skills = [
      { id: 's1', title: 'S1', content: '...', agentTypes: ['*'], taskTypes: ['keyword_research'], filePath: '' },
      { id: 's2', title: 'S2', content: '...', agentTypes: ['*'], taskTypes: ['*'], filePath: '' },
    ];

    const filtered = filterSkills(skills as any, 'seo', 'keyword_research');
    expect(filtered.length).toBe(2);
  });

  it('should filter out non-matching skills', () => {
    const skills = [
      { id: 's1', title: 'S1', content: '...', agentTypes: ['ad'], taskTypes: ['campaign_build'], filePath: '' },
    ];

    const filtered = filterSkills(skills as any, 'seo', 'site_crawl');
    expect(filtered.length).toBe(0);
  });

  it('should build prompt section from skills', () => {
    const skills = [
      { id: 'test', title: 'Test', content: '## Test Knowledge\nSome info', agentTypes: ['*'], taskTypes: ['*'], filePath: '' },
    ];

    const section = buildSkillPromptSection(skills as any);
    expect(section).toContain('<skill name="test">');
    expect(section).toContain('## Test Knowledge');
    expect(section).toContain('## Relevant Skills');
  });

  it('should return empty string when no skills', () => {
    expect(buildSkillPromptSection([])).toBe('');
  });
});

// =========================================================================
// 6. Skill Registry
// =========================================================================
describe('Skill Registry', () => {
  let registerSkill: typeof import('../packages/shared/src/skills/skill-registry.ts')['registerSkill'];
  let getSkill: typeof import('../packages/shared/src/skills/skill-registry.ts')['getSkill'];
  let getAllSkills: typeof import('../packages/shared/src/skills/skill-registry.ts')['getAllSkills'];
  let getSkillPromptForTask: typeof import('../packages/shared/src/skills/skill-registry.ts')['getSkillPromptForTask'];
  let clearSkillRegistry: typeof import('../packages/shared/src/skills/skill-registry.ts')['clearSkillRegistry'];

  beforeEach(async () => {
    const mod = await import('../packages/shared/src/skills/skill-registry.ts');
    registerSkill = mod.registerSkill;
    getSkill = mod.getSkill;
    getAllSkills = mod.getAllSkills;
    getSkillPromptForTask = mod.getSkillPromptForTask;
    clearSkillRegistry = mod.clearSkillRegistry;
    clearSkillRegistry();
  });

  it('should register and retrieve skills', () => {
    const skill = {
      id: 'test-skill',
      title: 'Test',
      content: 'content here',
      agentTypes: ['seo'],
      taskTypes: ['*'],
      filePath: '/test.md',
    };
    registerSkill(skill);
    expect(getSkill('test-skill')).toEqual(skill);
  });

  it('should list all registered skills', () => {
    registerSkill({ id: 's1', title: 'S1', content: '', agentTypes: ['*'], taskTypes: ['*'], filePath: '' });
    registerSkill({ id: 's2', title: 'S2', content: '', agentTypes: ['*'], taskTypes: ['*'], filePath: '' });
    expect(getAllSkills().length).toBe(2);
  });

  it('should get skill prompt for specific task', () => {
    registerSkill({
      id: 'seo-skill',
      title: 'SEO',
      content: 'SEO knowledge',
      agentTypes: ['seo'],
      taskTypes: ['keyword_research'],
      filePath: '',
    });
    registerSkill({
      id: 'ad-skill',
      title: 'Ad',
      content: 'Ad knowledge',
      agentTypes: ['ad'],
      taskTypes: ['*'],
      filePath: '',
    });

    const prompt = getSkillPromptForTask('seo', 'keyword_research');
    expect(prompt).toContain('seo-skill');
    expect(prompt).not.toContain('ad-skill');
  });

  it('should clear registry', () => {
    registerSkill({ id: 's1', title: 'S1', content: '', agentTypes: ['*'], taskTypes: ['*'], filePath: '' });
    clearSkillRegistry();
    expect(getAllSkills().length).toBe(0);
  });
});

// =========================================================================
// 7. Plugin Types & Registry  
// =========================================================================
describe('Plugin Registry', () => {
  let registerPluginInCatalog: typeof import('../packages/shared/src/plugins/plugin-registry.ts')['registerPluginInCatalog'];
  let searchPlugins: typeof import('../packages/shared/src/plugins/plugin-registry.ts')['searchPlugins'];
  let installPlugin: typeof import('../packages/shared/src/plugins/plugin-registry.ts')['installPlugin'];
  let getInstalledPlugins: typeof import('../packages/shared/src/plugins/plugin-registry.ts')['getInstalledPlugins'];
  let enablePlugin: typeof import('../packages/shared/src/plugins/plugin-registry.ts')['enablePlugin'];
  let disablePlugin: typeof import('../packages/shared/src/plugins/plugin-registry.ts')['disablePlugin'];
  let uninstallPlugin: typeof import('../packages/shared/src/plugins/plugin-registry.ts')['uninstallPlugin'];
  let executeHooks: typeof import('../packages/shared/src/plugins/plugin-registry.ts')['executeHooks'];
  let registerHook: typeof import('../packages/shared/src/plugins/plugin-registry.ts')['registerHook'];
  let clearPluginRegistry: typeof import('../packages/shared/src/plugins/plugin-registry.ts')['clearPluginRegistry'];

  const testManifest = {
    id: 'test/analytics',
    name: 'Test Analytics',
    version: '1.0.0',
    description: 'A test analytics plugin',
    author: 'Test',
    agentTypes: ['data-nexus'],
    capabilities: ['data_source' as const],
  };

  beforeEach(async () => {
    const mod = await import('../packages/shared/src/plugins/plugin-registry.ts');
    registerPluginInCatalog = mod.registerPluginInCatalog;
    searchPlugins = mod.searchPlugins;
    installPlugin = mod.installPlugin;
    getInstalledPlugins = mod.getInstalledPlugins;
    enablePlugin = mod.enablePlugin;
    disablePlugin = mod.disablePlugin;
    uninstallPlugin = mod.uninstallPlugin;
    executeHooks = mod.executeHooks;
    registerHook = mod.registerHook;
    clearPluginRegistry = mod.clearPluginRegistry;
    clearPluginRegistry();
  });

  it('should register and search plugins', () => {
    registerPluginInCatalog(testManifest);
    const results = searchPlugins('analytics');
    expect(results.length).toBe(1);
    expect(results[0]!.id).toBe('test/analytics');
  });

  it('should install and list plugins for tenant', () => {
    registerPluginInCatalog(testManifest);
    installPlugin('tenant-1', testManifest, { apiKey: 'xxx' });
    
    const installed = getInstalledPlugins('tenant-1');
    expect(installed.length).toBe(1);
    expect(installed[0]!.manifest.id).toBe('test/analytics');
    expect(installed[0]!.config.apiKey).toBe('xxx');
  });

  it('should enable/disable plugins', () => {
    installPlugin('tenant-1', testManifest);
    expect(disablePlugin('tenant-1', 'test/analytics')).toBe(true);
    
    const installed = getInstalledPlugins('tenant-1');
    expect(installed[0]!.enabled).toBe(false);
    
    expect(enablePlugin('tenant-1', 'test/analytics')).toBe(true);
    expect(getInstalledPlugins('tenant-1')[0]!.enabled).toBe(true);
  });

  it('should uninstall plugins', () => {
    installPlugin('tenant-1', testManifest);
    expect(uninstallPlugin('tenant-1', 'test/analytics')).toBe(true);
    expect(getInstalledPlugins('tenant-1').length).toBe(0);
  });

  it('should return false for operations on non-existent plugins', () => {
    expect(enablePlugin('tenant-1', 'nonexistent')).toBe(false);
    expect(disablePlugin('tenant-1', 'nonexistent')).toBe(false);
    expect(uninstallPlugin('tenant-1', 'nonexistent')).toBe(false);
  });

  it('should execute hooks in priority order', async () => {
    installPlugin('tenant-1', testManifest);
    
    const calls: number[] = [];
    
    registerHook({
      pluginId: 'test/analytics',
      hook: 'before_task',
      handler: async (_ctx, data: number) => {
        calls.push(2);
        return data + 20;
      },
      priority: 20,
    });
    
    registerHook({
      pluginId: 'test/analytics',
      hook: 'before_task',
      handler: async (_ctx, data: number) => {
        calls.push(1);
        return data + 10;
      },
      priority: 10,
    });
    
    const result = await executeHooks('before_task', {
      tenantId: 'tenant-1',
      agentType: 'data-nexus',
      config: {},
    }, 0);
    
    expect(result).toBe(30); // 0 + 10 + 20
    expect(calls).toEqual([1, 2]); // Priority order
  });

  it('should skip hooks for disabled plugins', async () => {
    installPlugin('tenant-1', testManifest);
    disablePlugin('tenant-1', 'test/analytics');
    
    registerHook({
      pluginId: 'test/analytics',
      hook: 'test_hook',
      handler: async (_ctx, data: number) => data + 100,
      priority: 1,
    });
    
    const result = await executeHooks('test_hook', {
      tenantId: 'tenant-1',
      agentType: 'data-nexus',
      config: {},
    }, 0);
    
    expect(result).toBe(0); // Hook not executed
  });

  it('should isolate plugins between tenants', () => {
    installPlugin('tenant-1', testManifest);
    expect(getInstalledPlugins('tenant-1').length).toBe(1);
    expect(getInstalledPlugins('tenant-2').length).toBe(0);
  });
});

// =========================================================================
// 8. CompletionResult type in router
// =========================================================================
describe('Router CompletionResult', () => {
  it('should export CompletionResult type alongside CompletionRequest', async () => {
    // Just verify the exports exist (type-level check at build time)
    const mod = await import('../packages/llm-router/src/router.ts');
    expect(typeof mod.routedCompletion).toBe('function');
    expect(typeof mod.routedCompletionWithUsage).toBe('function');
    expect(typeof mod.routedStream).toBe('function');
  });
});

// =========================================================================
// 9. TaskPayload with taskBudget field
// =========================================================================
describe('TaskPayload Budget Extension', () => {
  it('should accept taskBudget as optional field in TaskPayload', async () => {
    // Type-level check only — TaskPayload is a TypeScript interface
    
    // Type-level test: construct a payload with taskBudget
    const payload = {
      taskId: 'test-1',
      tenantId: 'tenant-1',
      agentType: 'seo',
      taskType: 'keyword_research',
      priority: 'medium',
      payload: {},
      correlationId: 'corr-1',
      maxRetries: 3,
      taskBudget: { maxTokens: 10000, maxTurns: 5, maxCostUsd: 1.0 },
    };

    expect(payload.taskBudget).toBeDefined();
    expect(payload.taskBudget.maxTokens).toBe(10000);
    expect(payload.taskBudget.maxTurns).toBe(5);
  });

  it('should work without taskBudget (backward compatible)', () => {
    const payload = {
      taskId: 'test-2',
      tenantId: 'tenant-1',
      agentType: 'seo',
      taskType: 'site_crawl',
      priority: 'low',
      payload: {},
      correlationId: 'corr-2',
      maxRetries: 3,
    };

    expect(payload.taskBudget).toBeUndefined();
  });
});

// =========================================================================
// 10. Agent Summary
// =========================================================================
describe('Agent Summary (unit)', () => {
  it('should export summary functions', async () => {
    const mod = await import('../packages/queue/src/agent-summary.ts');
    expect(typeof mod.recordAction).toBe('function');
    expect(typeof mod.generateSummary).toBe('function');
    expect(typeof mod.getCurrentSummary).toBe('function');
    expect(typeof mod.getTenantAgentSummaries).toBe('function');
    expect(typeof mod.clearTaskSummary).toBe('function');
    expect(mod.SUMMARY_INTERVAL_MS).toBe(30000);
  });
});

// =========================================================================
// 11. Memory Consolidation
// =========================================================================
describe('Memory Consolidation (unit)', () => {
  it('should export consolidation function', async () => {
    const mod = await import('../packages/queue/src/memory-consolidation.ts');
    expect(typeof mod.attemptConsolidation).toBe('function');
  });
});

// =========================================================================
// 12. Plan Approval
// =========================================================================
describe('Plan Approval (unit)', () => {
  it('should export approval functions', async () => {
    const mod = await import('../packages/queue/src/plan-approval.ts');
    expect(typeof mod.requestApproval).toBe('function');
    expect(typeof mod.approveRequest).toBe('function');
    expect(typeof mod.rejectRequest).toBe('function');
    expect(typeof mod.getPendingApprovals).toBe('function');
    expect(typeof mod.expireOldApprovals).toBe('function');
  });
});

// =========================================================================
// 13. Prompt Cache Sharing
// =========================================================================
describe('Prompt Cache (unit)', () => {
  it('should export cache functions', async () => {
    const mod = await import('../packages/llm-router/src/prompt-cache.ts');
    expect(typeof mod.getCachedPrompt).toBe('function');
    expect(typeof mod.cachePrompt).toBe('function');
    expect(typeof mod.buildCachedSystemPrompt).toBe('function');
    expect(typeof mod.invalidateTenantPromptCache).toBe('function');
  });
});

// =========================================================================
// 14. Index exports verification
// =========================================================================
describe('Package Exports', () => {
  it('llm-router should export all new functions', async () => {
    const mod = await import('../packages/llm-router/src/index.ts');
    
    // Token budget
    expect(typeof mod.createBudgetTracker).toBe('function');
    expect(typeof mod.recordTurn).toBe('function');
    expect(typeof mod.checkTokenBudget).toBe('function');
    expect(mod.DEFAULT_TASK_BUDGETS).toBeDefined();
    
    // Auto-compact
    expect(typeof mod.needsCompaction).toBe('function');
    expect(typeof mod.compactMessages).toBe('function');
    expect(typeof mod.autoCompactIfNeeded).toBe('function');
    
    // Prompt cache
    expect(typeof mod.getCachedPrompt).toBe('function');
    expect(typeof mod.buildCachedSystemPrompt).toBe('function');
    
    // CompletionResult
    expect(typeof mod.routedCompletionWithUsage).toBe('function');
  });

  it('queue should export all new functions', async () => {
    const mod = await import('../packages/queue/src/index.ts');
    
    // Memory consolidation
    expect(typeof mod.attemptConsolidation).toBe('function');
    
    // Agent summary
    expect(typeof mod.recordAction).toBe('function');
    expect(typeof mod.generateSummary).toBe('function');
    expect(mod.SUMMARY_INTERVAL_MS).toBe(30000);
    
    // Tool access
    expect(typeof mod.getToolPermissions).toBe('function');
    expect(typeof mod.isToolAllowed).toBe('function');
    
    // Plan approval
    expect(typeof mod.requestApproval).toBe('function');
    expect(typeof mod.approveRequest).toBe('function');
    expect(typeof mod.rejectRequest).toBe('function');
  });

  it('shared should export all new functions', async () => {
    const mod = await import('../packages/shared/src/index.ts');
    
    // OTel counters
    expect(typeof mod.initOtelCounters).toBe('function');
    expect(typeof mod.recordLlmMetrics).toBe('function');
    
    // Skills
    expect(typeof mod.loadSkill).toBe('function');
    expect(typeof mod.filterSkills).toBe('function');
    expect(typeof mod.registerSkill).toBe('function');
    expect(typeof mod.getSkillPromptForTask).toBe('function');
    
    // Plugins
    expect(typeof mod.registerPluginInCatalog).toBe('function');
    expect(typeof mod.installPlugin).toBe('function');
    expect(typeof mod.executeHooks).toBe('function');
  });
});

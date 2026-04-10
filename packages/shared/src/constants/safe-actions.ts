/**
 * Safe Task Types — Read-only tasks that don't modify external platforms.
 * These can be auto-activated during onboarding BEFORE the user confirms go-live,
 * providing immediate value in the "Opportunity Snapshot" dashboard.
 */
export const SAFE_TASK_TYPES: readonly string[] = [
  // SEO agent — read-only audits
  'seo_audit',
  'keyword_research',
  'competitor_analysis',
  'site_crawl',
  'core_web_vitals',
  'indexation_check',
  'competitor_seo_analysis',

  // AEO agent — read-only probes
  'citation_tracking',
  'ai_visibility_scoring',
  'aeo_probe',
  'build_entity_graph',
  'competitor_ai_analysis',

  // Data Nexus — read-only analysis
  'daily_analysis',
  'data_ingestion',
  'normalization',
  'quality_check',
  'time_series_forecast',

  // Compatibility — read-only checks
  'tech_stack_detection',
  'health_check',
  'schema_snapshot',
  'drift_detection',
  'rate_limit_check',
  'api_version_check',

  // Sales Pipeline — read-only analysis
  'icp_learn',
  'call_analyze',
  'value_pricing_brief',

  // Data Nexus — read-only experiments/reports
  'experiment_score',
  'experiment_playbook',
  'weekly_scorecard',
  'pacing_alert',
  'revenue_attribution',
  'client_report',

  // Content Writer — read-only scoring
  'expert_panel_review',
  'quality_gate',
  'editorial_brain',
  'quote_mining',

  // Ad Agent — read-only audits
  'cro_audit',

  // Social — read-only analysis
  'yt_competitive_analysis',

  // Finance — read-only analysis
  'cfo_briefing',
  'cost_estimate',
  'scenario_model',

  // Outbound — read-only monitoring
  'competitive_monitor',
  'cross_signal_detect',

  // Podcast — read-only extraction
  'content_extract',
  'viral_score',
] as const;

/** Check if a task type is safe (read-only) */
export function isSafeTaskType(taskType: string): boolean {
  return SAFE_TASK_TYPES.includes(taskType);
}

import type { AgentType, TaskPriority } from '../types/agent.js';
import type { PlanTier } from '../types/tenant.js';

/** Definition of each agent type and its capabilities */
export const AGENT_TYPE_DEFINITIONS: Record<AgentType, {
  label: string;
  description: string;
  taskTypes: string[];
  queuePrefix: string;
}> = {
  seo: {
    label: 'SEO Agent',
    description: 'Keyword research, content pipeline, technical SEO, backlink strategy, CMS publishing',
    taskTypes: [
      'keyword_research', 'competitor_analysis', 'intent_classification', 'gap_analysis',
      'brief_generation', 'article_writing', 'metadata_optimization', 'content_scheduling',
      'cms_publishing', 'site_crawl', 'core_web_vitals', 'schema_markup', 'indexation_check',
      'prospect_finding', 'outreach_generation', 'link_monitoring',
      'technical_seo_deep', 'competitor_seo_analysis',
      'content_attack_brief', 'gsc_optimization', 'trend_scouting',
    ],
    queuePrefix: 'seo-tasks',
  },
  ad: {
    label: 'Ad Agent',
    description: 'Campaign building, audience targeting, bid optimization, budget management',
    taskTypes: [
      'campaign_build', 'audience_targeting', 'ad_group_generation', 'budget_allocation',
      'bid_optimization', 'roas_tracking', 'cpa_optimization', 'dayparting_analysis',
      'spend_monitoring', 'anomaly_detection', 'alert_management',
      'cro_audit', 'survey_lead_magnet',
    ],
    queuePrefix: 'ad-tasks',
  },
  creative: {
    label: 'Creative Engine',
    description: 'Image generation, video scripts, ad copy, landing pages, A/B testing',
    taskTypes: [
      'image_generation', 'video_script_writing', 'copy_generation', 'landing_page_build',
      'format_adaptation', 'ab_test_setup', 'ab_test_analysis', 'fatigue_detection',
      'creative_scoring', 'winner_scaling',
    ],
    queuePrefix: 'creative-tasks',
  },
  'data-nexus': {
    label: 'Data Nexus Agent',
    description: 'Data ingestion, attribution modeling, funnel optimization, forecasting',
    taskTypes: [
      'data_ingestion', 'normalization', 'schema_mapping', 'quality_check',
      'multi_touch_attribution', 'channel_scoring', 'revenue_mapping',
      'funnel_analysis', 'experiment_generation', 'variant_testing', 'conversion_prediction',
      'time_series_forecast', 'budget_recommendation', 'scenario_planning',
      'experiment_create', 'experiment_score', 'experiment_playbook',
      'weekly_scorecard', 'pacing_alert', 'revenue_attribution', 'client_report',
    ],
    queuePrefix: 'data-tasks',
  },
  aeo: {
    label: 'AEO Agent',
    description: 'AI citation tracking, entity optimization, AI visibility scoring, live LLM probing',
    taskTypes: [
      'citation_tracking', 'entity_optimization', 'ai_visibility_scoring',
      'schema_for_ai', 'competitor_ai_analysis',
      'aeo_probe', 'build_entity_graph',
    ],
    queuePrefix: 'aeo-tasks',
  },
  compatibility: {
    label: 'Compatibility Agent',
    description: 'Integration lifecycle, OAuth management, health monitoring, schema drift, self-healing',
    taskTypes: [
      'tech_stack_detection', 'onboarding_flow', 'oauth_connect', 'oauth_refresh',
      'health_check', 'schema_snapshot', 'drift_detection', 'auto_reconnect',
      'permission_recovery', 'tool_migration', 'rate_limit_check', 'api_version_check',
      'connector_request', 'tenant_provision', 'strategy_generate', 'agent_activate',
    ],
    queuePrefix: 'compatibility-tasks',
  },
  reddit: {
    label: 'Reddit Agent',
    description: 'Subreddit monitoring, brand mention detection, LLM-scored sentiment, reply drafting',
    taskTypes: [
      'scan_subreddits', 'draft_reply', 'post_reply',
    ],
    queuePrefix: 'reddit-tasks',
  },
  social: {
    label: 'Social Listening Agent',
    description: 'Twitter/X, Hacker News, and YouTube brand mention monitoring and engagement',
    taskTypes: [
      'scan_twitter', 'scan_hackernews', 'scan_youtube', 'draft_social_reply',
      'yt_competitive_analysis',
    ],
    queuePrefix: 'social-tasks',
  },
  'content-writer': {
    label: 'Content Writer Agent',
    description: 'Long-form blog posts, social copy, email copy generation with web research and SEO scoring',
    taskTypes: [
      'write_blog_post', 'write_social_copy', 'write_email', 'score_content', 'publish_content',
      'expert_panel_review', 'quality_gate', 'editorial_brain', 'quote_mining',
      'content_transform', 'x_longform_post', 'generate_deck',
    ],
    queuePrefix: 'content-tasks',
  },
  geo: {
    label: 'GEO Agent',
    description: 'Local SEO, geographic rank tracking, citation/NAP auditing, LocalBusiness schema generation',
    taskTypes: [
      'geo_keyword_research', 'geo_rank_check', 'geo_citation_audit', 'geo_schema_generate',
    ],
    queuePrefix: 'geo-tasks',
  },
  'sales-pipeline': {
    label: 'Sales Pipeline Agent',
    description: 'Lead scoring, suppression, deal resurrection, ICP learning, trigger prospecting, value pricing',
    taskTypes: [
      'webhook_ingest', 'suppression_check', 'lead_route', 'deal_resurrect',
      'trigger_prospect', 'icp_learn', 'value_pricing_brief', 'call_analyze',
      'pricing_pattern_recommend',
    ],
    queuePrefix: 'sales-pipeline-tasks',
  },
  outbound: {
    label: 'Outbound Agent',
    description: 'Cold outbound campaign design, lead pipeline, competitive monitoring, cross-signal detection',
    taskTypes: [
      'cold_outbound_design', 'lead_pipeline', 'competitive_monitor', 'cross_signal_detect', 'outbound_send',
    ],
    queuePrefix: 'outbound-tasks',
  },
  finance: {
    label: 'Finance Agent',
    description: 'CFO briefings, cost estimation, scenario modeling from financial data',
    taskTypes: [
      'cfo_briefing', 'cost_estimate', 'scenario_model',
    ],
    queuePrefix: 'finance-tasks',
  },
  podcast: {
    label: 'Podcast Agent',
    description: 'Podcast ingestion, content atom extraction, multi-platform content generation, viral scoring',
    taskTypes: [
      'podcast_ingest', 'content_extract', 'content_generate', 'viral_score', 'calendar_build',
    ],
    queuePrefix: 'podcast-tasks',
  },
};

/** Task type → agent type mapping */
export const TASK_TO_AGENT_MAP: Record<string, AgentType> = Object.entries(AGENT_TYPE_DEFINITIONS).reduce(
  (map, [agentType, def]) => {
    for (const taskType of def.taskTypes) {
      map[taskType] = agentType as AgentType;
    }
    return map;
  },
  {} as Record<string, AgentType>,
);

/** Priority ordering for task scheduling */
export const PRIORITY_ORDER: Record<TaskPriority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

/** Task priority defaults by task type category */
export const TASK_PRIORITY_DEFAULTS: Record<string, TaskPriority> = {
  anomaly_detection: 'critical',
  alert_management: 'critical',
  spend_monitoring: 'high',
  bid_optimization: 'high',
  roas_tracking: 'high',
  campaign_build: 'high',
  ab_test_analysis: 'medium',
  fatigue_detection: 'medium',
  keyword_research: 'medium',
  content_scheduling: 'low',
  link_monitoring: 'low',
  scenario_planning: 'low',
};

/** Agent limits per plan — compatibility agent is always included */
export const PLAN_AGENT_LIMITS: Record<PlanTier, {
  maxAgents: number;
  allowedTypes: AgentType[];
  maxConcurrentTasks: number;
}> = {
  launchpad: {
    maxAgents: 4,
    allowedTypes: ['compatibility', 'seo', 'ad', 'data-nexus'],
    maxConcurrentTasks: 5,
  },
  growth: {
    maxAgents: 14,
    allowedTypes: ['compatibility', 'seo', 'ad', 'data-nexus', 'creative', 'aeo', 'reddit', 'social', 'content-writer', 'geo', 'sales-pipeline', 'outbound', 'podcast', 'finance'],
    maxConcurrentTasks: 20,
  },
  enterprise: {
    maxAgents: 20,
    allowedTypes: ['compatibility', 'seo', 'ad', 'data-nexus', 'creative', 'aeo', 'reddit', 'social', 'content-writer', 'geo', 'sales-pipeline', 'outbound', 'podcast', 'finance'],
    maxConcurrentTasks: 50,
  },
};

/** Analytics time granularity */
export type TimeGranularity = 'hour' | 'day' | 'week' | 'month';

/** Attribution models */
export type AttributionModel =
  | 'last_click'
  | 'first_click'
  | 'linear'
  | 'time_decay'
  | 'position_based'
  | 'data_driven';

/** Marketing channels for attribution */
export type MarketingChannel =
  | 'organic_search'
  | 'paid_search'
  | 'social_organic'
  | 'social_paid'
  | 'email'
  | 'referral'
  | 'direct'
  | 'display'
  | 'video'
  | 'affiliate';

export interface AnalyticsQuery {
  tenantId: string;
  startDate: string;
  endDate: string;
  granularity: TimeGranularity;
  metrics: string[];
  dimensions?: string[];
  filters?: AnalyticsFilter[];
  limit?: number;
}

export interface AnalyticsFilter {
  field: string;
  operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'contains';
  value: string | number | string[];
}

export interface AnalyticsDataPoint {
  timestamp: string;
  metrics: Record<string, number>;
  dimensions: Record<string, string>;
}

export interface AnalyticsSummary {
  tenantId: string;
  period: { start: string; end: string };
  totalRevenue: number;
  totalSpend: number;
  totalConversions: number;
  overallRoas: number;
  topChannels: ChannelMetrics[];
  topCampaigns: CampaignSummary[];
}

export interface ChannelMetrics {
  channel: MarketingChannel;
  impressions: number;
  clicks: number;
  conversions: number;
  spend: number;
  revenue: number;
  roas: number;
  attributionWeight: number;
}

export interface CampaignSummary {
  campaignId: string;
  campaignName: string;
  spend: number;
  revenue: number;
  roas: number;
  conversions: number;
}

export interface FunnelStage {
  name: string;
  visitors: number;
  conversions: number;
  conversionRate: number;
  dropoffRate: number;
  avgTimeInStageMs: number;
}

export interface FunnelAnalysis {
  tenantId: string;
  stages: FunnelStage[];
  overallConversionRate: number;
  bottleneck: string;
  recommendations: string[];
}

export interface ForecastResult {
  tenantId: string;
  metric: string;
  period: { start: string; end: string };
  predicted: number;
  lower95: number;
  upper95: number;
  trend: 'increasing' | 'decreasing' | 'stable';
  confidence: number;
}

/** Cross-tenant anonymized insight */
export interface CompoundInsight {
  id: string;
  category: string;
  pattern: string;
  confidence: number;
  sampleSize: number;
  recommendation: string;
  applicableIndustries: string[];
  createdAt: Date;
}

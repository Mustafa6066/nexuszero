import type { AgentType } from './agent.js';

/** Supported campaign types */
export type CampaignType = 'seo' | 'ppc' | 'social' | 'display' | 'video' | 'email';

/** Campaign lifecycle states */
export type CampaignStatus = 'draft' | 'pending_review' | 'active' | 'paused' | 'completed' | 'archived';

/** Ad platforms we integrate with */
export type AdPlatform = 'google_ads' | 'meta_ads' | 'linkedin_ads';

/** Bid strategies for ad campaigns */
export type BidStrategy = 'manual_cpc' | 'target_cpa' | 'target_roas' | 'maximize_conversions' | 'maximize_clicks';

export interface Campaign {
  id: string;
  tenantId: string;
  name: string;
  type: CampaignType;
  status: CampaignStatus;
  platform: AdPlatform | null;
  budget: CampaignBudget;
  targeting: AudienceTargeting;
  schedule: CampaignSchedule;
  config: CampaignConfig;
  metrics: CampaignMetrics;
  managedByAgent: AgentType | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CampaignBudget {
  dailyBudget: number;
  totalBudget: number | null;
  currency: string;
  bidStrategy: BidStrategy;
  targetCpa: number | null;
  targetRoas: number | null;
}

export interface AudienceTargeting {
  locations: string[];
  languages: string[];
  ageRange: { min: number; max: number } | null;
  genders: ('male' | 'female' | 'all')[];
  interests: string[];
  keywords: string[];
  excludedKeywords: string[];
  customAudiences: string[];
  lookalikes: string[];
}

export interface CampaignSchedule {
  startDate: string;
  endDate: string | null;
  dayparting: DaypartingRule[] | null;
}

export interface DaypartingRule {
  dayOfWeek: number; // 0 = Sunday
  startHour: number;
  endHour: number;
  bidModifier: number; // e.g. 1.2 = +20%
}

export interface CampaignConfig {
  seo?: SeoConfig;
  ppc?: PpcConfig;
}

export interface SeoConfig {
  targetKeywords: string[];
  contentBriefs: boolean;
  technicalAudit: boolean;
  backlinkOutreach: boolean;
  aeoOptimization: boolean;
}

export interface PpcConfig {
  adGroups: AdGroup[];
  negativeKeywords: string[];
  adExtensions: string[];
  conversionTracking: boolean;
}

export interface AdGroup {
  name: string;
  keywords: string[];
  matchType: 'broad' | 'phrase' | 'exact';
  maxCpc: number | null;
}

export interface CampaignMetrics {
  impressions: number;
  clicks: number;
  conversions: number;
  spend: number;
  revenue: number;
  ctr: number;
  cpc: number;
  cpa: number;
  roas: number;
  qualityScore: number | null;
}

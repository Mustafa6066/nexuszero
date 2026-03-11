/** AI platforms we track citations on */
export type AIPlatform = 'chatgpt' | 'perplexity' | 'google_ai_overview' | 'gemini' | 'bing_copilot' | 'claude';

/** Citation tracking result */
export interface AEOCitation {
  id: string;
  tenantId: string;
  query: string;
  platform: AIPlatform;
  cited: boolean;
  citationText: string | null;
  citationUrl: string | null;
  position: number | null; // Position in AI response (1=first cited)
  competitors: CompetitorCitation[];
  checkedAt: Date;
}

export interface CompetitorCitation {
  domain: string;
  cited: boolean;
  position: number | null;
}

/** Entity optimization for AI visibility */
export interface EntityProfile {
  tenantId: string;
  entityName: string;
  entityType: 'organization' | 'product' | 'person' | 'service';
  knowledgePanelPresent: boolean;
  wikiDataId: string | null;
  schemaMarkup: SchemaMarkupStatus;
  structuredDataScore: number; // 0-100
  recommendations: string[];
}

export interface SchemaMarkupStatus {
  hasOrganization: boolean;
  hasProduct: boolean;
  hasFaq: boolean;
  hasHowTo: boolean;
  hasReview: boolean;
  hasArticle: boolean;
  hasBreadcrumb: boolean;
  hasSitelinks: boolean;
  errors: string[];
}

/** AI Visibility score across platforms */
export interface AIVisibilityScore {
  tenantId: string;
  overallScore: number; // 0-100
  platformScores: PlatformVisibility[];
  topQueries: QueryVisibility[];
  trend: 'improving' | 'declining' | 'stable';
  weekOverWeekChange: number;
}

export interface PlatformVisibility {
  platform: AIPlatform;
  score: number;
  citationCount: number;
  avgPosition: number | null;
  queriesTracked: number;
}

export interface QueryVisibility {
  query: string;
  category: string;
  platforms: {
    platform: AIPlatform;
    cited: boolean;
    position: number | null;
  }[];
  overallVisibility: number;
}

/** Optimized schema for AI consumption */
export interface AIOptimizedSchema {
  tenantId: string;
  url: string;
  schemaType: string;
  jsonLd: Record<string, unknown>;
  optimizedFor: AIPlatform[];
  entityCoverage: number; // 0-100 what % of key entities are in structured data
}

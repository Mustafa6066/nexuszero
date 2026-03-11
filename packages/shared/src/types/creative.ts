/** Creative asset types */
export type CreativeType = 'image' | 'video_script' | 'ad_copy' | 'landing_page' | 'email_template';

/** Creative test status */
export type CreativeTestStatus = 'draft' | 'running' | 'completed' | 'stopped';

/** Image generation provider */
export type ImageProvider = 'stability_ai' | 'dall_e_3';

/** Creative dimensions for different platforms */
export interface CreativeDimensions {
  width: number;
  height: number;
  label: string; // e.g. "Facebook Feed", "Instagram Story"
}

export interface Creative {
  id: string;
  tenantId: string;
  campaignId: string | null;
  type: CreativeType;
  name: string;
  status: 'draft' | 'generated' | 'approved' | 'rejected' | 'archived';
  content: CreativeContent;
  brandScore: number; // 0-100 brand consistency score
  predictedCtr: number | null;
  generationPrompt: string;
  generationModel: string;
  variants: CreativeVariant[];
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

export type CreativeContent =
  | ImageCreativeContent
  | VideoscriptCreativeContent
  | AdCopyCreativeContent
  | LandingPageCreativeContent;

export interface ImageCreativeContent {
  type: 'image';
  imageUrl: string;
  thumbnailUrl: string;
  dimensions: CreativeDimensions;
  altText: string;
  overlayText: string | null;
  provider: ImageProvider;
}

export interface VideoscriptCreativeContent {
  type: 'video_script';
  script: string;
  scenes: VideoScene[];
  estimatedDurationSeconds: number;
  voiceoverText: string | null;
  musicSuggestion: string | null;
}

export interface VideoScene {
  sceneNumber: number;
  description: string;
  durationSeconds: number;
  visualDirection: string;
  dialogue: string | null;
}

export interface AdCopyCreativeContent {
  type: 'ad_copy';
  headline: string;
  description: string;
  callToAction: string;
  displayUrl: string | null;
  emotionalArc: EmotionalArc;
  platform: string;
}

export type EmotionalArc = 'problem_solution' | 'aspiration' | 'urgency' | 'social_proof' | 'curiosity' | 'fear_of_missing_out';

export interface LandingPageCreativeContent {
  type: 'landing_page';
  html: string;
  css: string;
  headline: string;
  subheadline: string;
  ctaText: string;
  ctaUrl: string;
  sections: LandingPageSection[];
}

export interface LandingPageSection {
  type: 'hero' | 'features' | 'testimonials' | 'cta' | 'faq' | 'pricing';
  content: string;
  order: number;
}

export interface CreativeVariant {
  id: string;
  variantLabel: string; // "A", "B", "C", etc.
  content: CreativeContent;
  impressions: number;
  clicks: number;
  conversions: number;
  ctr: number;
  conversionRate: number;
}

export interface CreativeTest {
  id: string;
  tenantId: string;
  campaignId: string;
  creativeId: string;
  status: CreativeTestStatus;
  variants: CreativeTestVariant[];
  winnerVariantId: string | null;
  confidenceLevel: number; // 0-1, typically need >= 0.95
  totalImpressions: number;
  startedAt: Date;
  completedAt: Date | null;
}

export interface CreativeTestVariant {
  variantId: string;
  impressions: number;
  clicks: number;
  conversions: number;
  ctr: number;
  conversionRate: number;
  bayesianProbabilityOfBeingBest: number;
}

export interface CreativeGenerationRequest {
  tenantId: string;
  campaignId: string | null;
  type: CreativeType;
  prompt: string;
  brandGuidelines: BrandGuidelines;
  targetAudience: string;
  platform: string;
  dimensions?: CreativeDimensions;
  variants: number; // How many variants to generate
  referenceCreativeIds?: string[];
}

export interface BrandGuidelines {
  primaryColor: string;
  secondaryColor: string;
  fontFamily: string;
  tone: string; // e.g. "professional", "playful", "authoritative"
  logoUrl: string | null;
  doNotUse: string[];
}

/** Fatigue detection result */
export interface FatigueSignal {
  creativeId: string;
  tenantId: string;
  currentCtr: number;
  peakCtr: number;
  declinePercent: number;
  daysSincePeak: number;
  recommendation: 'refresh' | 'pause' | 'replace' | 'continue';
  suggestedRefreshDate: string;
}

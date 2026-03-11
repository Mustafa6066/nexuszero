import type { CreativeType, CreativeDimensions } from '../types/creative.js';

/** Standard creative dimensions for each platform */
export const PLATFORM_DIMENSIONS: Record<string, CreativeDimensions[]> = {
  facebook_feed: [
    { width: 1200, height: 628, label: 'Facebook Feed Landscape' },
    { width: 1080, height: 1080, label: 'Facebook Feed Square' },
  ],
  facebook_story: [
    { width: 1080, height: 1920, label: 'Facebook Story' },
  ],
  instagram_feed: [
    { width: 1080, height: 1080, label: 'Instagram Feed Square' },
    { width: 1080, height: 1350, label: 'Instagram Feed Portrait' },
  ],
  instagram_story: [
    { width: 1080, height: 1920, label: 'Instagram Story' },
  ],
  instagram_reels: [
    { width: 1080, height: 1920, label: 'Instagram Reels' },
  ],
  google_display: [
    { width: 300, height: 250, label: 'Medium Rectangle' },
    { width: 728, height: 90, label: 'Leaderboard' },
    { width: 336, height: 280, label: 'Large Rectangle' },
    { width: 160, height: 600, label: 'Wide Skyscraper' },
    { width: 320, height: 50, label: 'Mobile Leaderboard' },
  ],
  google_search: [
    { width: 0, height: 0, label: 'Text Ad (no image)' },
  ],
  linkedin_feed: [
    { width: 1200, height: 627, label: 'LinkedIn Feed' },
    { width: 1080, height: 1080, label: 'LinkedIn Square' },
  ],
  youtube_thumbnail: [
    { width: 1280, height: 720, label: 'YouTube Thumbnail' },
  ],
};

/** Creative type configuration */
export const CREATIVE_TYPE_CONFIG: Record<CreativeType, {
  label: string;
  maxVariants: number;
  estimatedGenerationTimeMs: number;
  requiresApproval: boolean;
}> = {
  image: {
    label: 'Image Creative',
    maxVariants: 10,
    estimatedGenerationTimeMs: 15000,
    requiresApproval: false,
  },
  video_script: {
    label: 'Video Script',
    maxVariants: 5,
    estimatedGenerationTimeMs: 30000,
    requiresApproval: true,
  },
  ad_copy: {
    label: 'Ad Copy',
    maxVariants: 20,
    estimatedGenerationTimeMs: 5000,
    requiresApproval: false,
  },
  landing_page: {
    label: 'Landing Page',
    maxVariants: 3,
    estimatedGenerationTimeMs: 45000,
    requiresApproval: true,
  },
  email_template: {
    label: 'Email Template',
    maxVariants: 5,
    estimatedGenerationTimeMs: 10000,
    requiresApproval: true,
  },
};

/** Emotional arc templates for ad copy */
export const EMOTIONAL_ARC_TEMPLATES = {
  problem_solution: {
    label: 'Problem → Solution',
    structure: 'Identify pain → Agitate → Present solution → CTA',
    bestFor: ['b2b_saas', 'healthcare', 'finance'],
  },
  aspiration: {
    label: 'Aspiration',
    structure: 'Paint ideal future → Show path → Build desire → CTA',
    bestFor: ['luxury', 'education', 'lifestyle'],
  },
  urgency: {
    label: 'Urgency',
    structure: 'Limited time/quantity → Fear of missing out → Easy action → CTA',
    bestFor: ['ecommerce', 'events', 'saas_trial'],
  },
  social_proof: {
    label: 'Social Proof',
    structure: 'Others succeeded → Specific numbers → Trust building → CTA',
    bestFor: ['saas', 'agency', 'marketplace'],
  },
  curiosity: {
    label: 'Curiosity Gap',
    structure: 'Unexpected fact → Information gap → Promise of revelation → CTA',
    bestFor: ['content', 'media', 'education'],
  },
  fear_of_missing_out: {
    label: 'FOMO',
    structure: 'Competitors are doing it → You are falling behind → Easy fix → CTA',
    bestFor: ['b2b_saas', 'martech', 'analytics'],
  },
} as const;

/** Minimum sample size for statistically significant A/B test results */
export const MIN_AB_TEST_SAMPLE_SIZE = 100;

/** Default confidence level for A/B test winner declaration */
export const AB_TEST_CONFIDENCE_THRESHOLD = 0.95;

/** CTR decline threshold (%) to trigger fatigue detection */
export const FATIGUE_CTR_DECLINE_THRESHOLD = 20;

/** Days to monitor before fatigue detection is active */
export const FATIGUE_MONITORING_WINDOW_DAYS = 7;

/**
 * Pre-flight website scanner types for EaaS onboarding.
 * Scans any domain and produces a requirements checklist
 * showing what's detected, what's missing, and what NexusZero can power.
 */

import type { Platform, DetectedTechnology, DnsAnalysis } from './integration.js';

// ── Pre-flight scan ────────────────────────────────────────────────────────

/** Category buckets for the scan report */
export type ScanCategory = 'analytics' | 'advertising' | 'crm' | 'cms' | 'seo' | 'performance' | 'security';

/** Readiness status for a single check item */
export type ReadinessStatus = 'detected' | 'missing' | 'partial' | 'recommended';

/** A single item in the requirements checklist */
export interface ScanCheckItem {
  category: ScanCategory;
  label: string;
  status: ReadinessStatus;
  detail: string;
  /** If applicable, the platform detected or recommended */
  platform?: Platform;
  /** Detection confidence 0-1 */
  confidence?: number;
}

/** SEO baseline data gathered during the scan */
export interface SeoBaseline {
  hasRobotsTxt: boolean;
  hasSitemap: boolean;
  hasMetaTitle: boolean;
  hasMetaDescription: boolean;
  hasOpenGraph: boolean;
  hasStructuredData: boolean;
  hasCanonical: boolean;
  hasHreflang: boolean;
}

/** SSL / security info */
export interface SecurityInfo {
  hasHttps: boolean;
  redirectsToHttps: boolean;
  hasHsts: boolean;
}

/** Performance hints */
export interface PerformanceHints {
  serverResponseMs: number;
  hasCompression: boolean;
  contentLengthBytes?: number;
}

/** Full pre-flight scan result */
export interface PreflightScanResult {
  domain: string;
  scannedUrl: string;
  scannedAt: string;
  /** Overall readiness score 0-100 */
  readinessScore: number;

  /** Detected technologies */
  detectedTech: DetectedTechnology[];
  /** DNS analysis */
  dns: DnsAnalysis | null;
  /** SEO baseline */
  seo: SeoBaseline;
  /** Security info */
  security: SecurityInfo;
  /** Performance hints */
  performance: PerformanceHints;

  /** Full requirements checklist */
  checklist: ScanCheckItem[];

  /** Platforms that can be auto-connected by NexusZero */
  connectablePlatforms: Platform[];
  /** Platforms the user should set up before onboarding */
  missingPlatforms: Platform[];
  /** Recommended NexusZero agents for this site */
  recommendedAgents: string[];
}

// ── Fleet engine deploy ────────────────────────────────────────────────────

/** Request to deploy a NexusZero engine (EaaS) */
export interface EngineDeployRequest {
  /** The domain to deploy for */
  websiteUrl: string;
  /** Company/brand name */
  companyName: string;
  /** Which agent types to activate */
  agents: string[];
  /** Subscription tier */
  tier: 'launchpad' | 'growth' | 'enterprise';
  /** Selected platforms to connect during deploy */
  platforms?: Platform[];
  /** Skip pre-flight scan (if already done) */
  skipPreflight?: boolean;
}

/** Status of an engine deployment */
export type EngineDeployStatus =
  | 'preflight'
  | 'provisioning'
  | 'connecting'
  | 'configuring'
  | 'activating'
  | 'live'
  | 'failed';

/** Response from engine deploy API */
export interface EngineDeployResponse {
  deploymentId: string;
  tenantId: string;
  status: EngineDeployStatus;
  progress: number;
  steps: EngineDeployStep[];
  estimatedSecondsRemaining?: number;
}

/** A single step in the deploy process */
export interface EngineDeployStep {
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  detail?: string;
  startedAt?: string;
  completedAt?: string;
}

/**
 * Integration & Connector types for the Compatibility Agent.
 * These define the contract for all external platform integrations.
 */

/** All supported integration platforms */
export type Platform =
  | 'google_analytics'
  | 'google_ads'
  | 'google_search_console'
  | 'meta_ads'
  | 'linkedin_ads'
  | 'hubspot'
  | 'salesforce'
  | 'wordpress'
  | 'webflow'
  | 'contentful'
  | 'shopify'
  | 'mixpanel'
  | 'amplitude'
  | 'slack'
  | 'sendgrid'
  | 'stripe_connect';

/** Platform categories for grouping */
export type PlatformCategory = 'analytics' | 'ads' | 'crm' | 'cms' | 'seo' | 'messaging' | 'payments';

/** Integration connection status */
export type IntegrationStatus =
  | 'connected'
  | 'degraded'
  | 'disconnected'
  | 'expired'
  | 'reconnecting';

/** How the integration was originally detected */
export type DetectionMethod = 'auto_discovery' | 'manual_connect';

/** Health check types */
export type HealthCheckType = 'ping' | 'auth' | 'scope' | 'schema' | 'rate_limit';

/** Health check result status */
export type HealthCheckStatus = 'pass' | 'warn' | 'fail';

/** Onboarding state machine states (extended for Compatibility Agent) */
export type CompatOnboardingState =
  | 'initiated'
  | 'detecting'
  | 'connecting'
  | 'auditing'
  | 'provisioning'
  | 'strategizing'
  | 'activating'
  | 'live'
  | 'failed';

/** OAuth token pair (decrypted in-memory representation) */
export interface OAuthTokens {
  accessToken: string;
  refreshToken: string | null;
  tokenType: string;
  expiresAt: Date;
  scopes: string[];
}

/** Result of an OAuth connection attempt */
export interface ConnectionResult {
  success: boolean;
  platform: Platform;
  scopes: string[];
  expiresAt: Date;
  accountId?: string;
  accountName?: string;
  error?: string;
}

/** Health check result from a connector */
export interface HealthCheckResult {
  status: HealthCheckStatus;
  latencyMs: number;
  details: Record<string, unknown>;
  timestamp: Date;
}

/** Scope validation result */
export interface ScopeValidation {
  valid: boolean;
  granted: string[];
  required: string[];
  missing: string[];
}

/** Rate limit information parsed from API response headers */
export interface RateLimitInfo {
  remaining: number;
  limit: number;
  resetAt: Date;
  retryAfterMs?: number;
}

/** Rate limit status for a connector */
export interface RateLimitStatus {
  platform: Platform;
  remaining: number;
  limit: number;
  resetAt: Date;
  utilizationPercent: number;
}

/** Schema snapshot for drift detection */
export interface SchemaSnapshot {
  endpoint: string;
  schema: Record<string, unknown>;
  hash: string;
  capturedAt: Date;
}

/** Schema drift detection result */
export interface SchemaDrift {
  endpoint: string;
  fieldsAdded: string[];
  fieldsRemoved: string[];
  fieldsTypeChanged: Array<{
    field: string;
    oldType: string;
    newType: string;
  }>;
  severity: 'info' | 'warning' | 'breaking';
  detectedAt: Date;
}

/** Connector capability descriptor */
export interface ConnectorCapability {
  type: PlatformCategory;
  actions: string[];
  dataTypes: string[];
}

/** Integration record (full DB row shape) */
export interface Integration {
  id: string;
  tenantId: string;
  platform: Platform;
  status: IntegrationStatus;
  accessTokenEncrypted: string;
  refreshTokenEncrypted: string | null;
  tokenExpiresAt: Date | null;
  scopesGranted: string[];
  scopesRequired: string[];
  apiVersion: string | null;
  lastSuccessfulCall: Date | null;
  lastError: string | null;
  errorCount: number;
  healthScore: number;
  latencyP95Ms: number | null;
  rateLimitRemaining: number | null;
  rateLimitResetAt: Date | null;
  detectedVia: DetectionMethod;
  config: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

/** Integration health check log record */
export interface IntegrationHealthRecord {
  id: string;
  integrationId: string;
  tenantId: string;
  checkType: HealthCheckType;
  status: HealthCheckStatus;
  latencyMs: number;
  details: Record<string, unknown>;
  checkedAt: Date;
}

/** Schema snapshot record */
export interface SchemaSnapshotRecord {
  id: string;
  integrationId: string;
  tenantId: string;
  endpointPath: string;
  responseSchema: Record<string, unknown>;
  schemaHash: string;
  capturedAt: Date;
}

/** Compatibility request (inter-agent data request) */
export interface CompatibilityRequest {
  id: string;
  tenantId: string;
  requestingAgent: string;
  connector: Platform;
  action: string;
  params: Record<string, unknown>;
  priority: 'critical' | 'high' | 'normal' | 'low';
  correlationId: string;
  timestamp: string;
}

/** Compatibility response (inter-agent data response) */
export interface CompatibilityResponse {
  id: string;
  requestId: string;
  tenantId: string;
  connector: Platform;
  action: string;
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
  latencyMs: number;
  fromCache: boolean;
  correlationId: string;
  timestamp: string;
}

/** Tech stack detection result */
export interface TechStackDetection {
  domain: string;
  cms: DetectedTechnology | null;
  analytics: DetectedTechnology[];
  adPixels: DetectedTechnology[];
  crm: DetectedTechnology[];
  seo: DetectedTechnology[];
  ecommerce: DetectedTechnology | null;
  emailProvider: DetectedTechnology | null;
  dnsInfo: DnsAnalysis;
  detectedAt: Date;
  confidence: number;
}

/** A single detected technology */
export interface DetectedTechnology {
  platform: Platform;
  confidence: number;
  evidence: string[];
  suggestedScopes: string[];
}

/** DNS analysis result */
export interface DnsAnalysis {
  mxRecords: string[];
  spfRecord: string | null;
  txtRecords: string[];
  inferredProviders: string[];
}

/** Onboarding session state */
export interface OnboardingSession {
  id: string;
  tenantId: string;
  state: CompatOnboardingState;
  domain: string;
  detectedStack: TechStackDetection | null;
  connectedPlatforms: Platform[];
  auditProgress: number;
  strategyGenerated: boolean;
  errors: Array<{ step: string; message: string; timestamp: string }>;
  startedAt: string;
  updatedAt: string;
}

/** Re-auth link details for client */
export interface ReauthLink {
  integrationId: string;
  platform: Platform;
  url: string;
  expiresAt: Date;
  missingScopes: string[];
}

/** Integration health summary */
export interface IntegrationHealthSummary {
  totalIntegrations: number;
  healthy: number;
  degraded: number;
  disconnected: number;
  overallScore: number;
  lastCheckedAt: Date | null;
}

/** Integration webhook event types */
export type IntegrationEventType =
  | 'integration.connected'
  | 'integration.degraded'
  | 'integration.disconnected'
  | 'integration.recovered'
  | 'integration.token_refreshed'
  | 'integration.scope_revoked'
  | 'integration.schema_changed'
  | 'integration.reauth_needed'
  | 'integration.migration_started'
  | 'integration.migration_completed';

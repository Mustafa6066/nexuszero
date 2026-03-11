/** Plan tiers available to tenants */
export type PlanTier = 'launchpad' | 'growth' | 'enterprise';

/** Current status of a tenant */
export type TenantStatus = 'pending' | 'provisioning' | 'active' | 'suspended' | 'churned';

/** Onboarding state machine states */
export type OnboardingState =
  | 'created'
  | 'oauth_connecting'
  | 'oauth_connected'
  | 'auditing'
  | 'audit_complete'
  | 'provisioning'
  | 'provisioned'
  | 'strategy_generating'
  | 'strategy_ready'
  | 'going_live'
  | 'active'
  | 'failed';

export interface TenantBranding {
  primaryColor: string;
  logoUrl: string | null;
  companyName: string;
}

export interface TenantSettings {
  branding: TenantBranding;
  timezone: string;
  weeklyReportEnabled: boolean;
  slackWebhookUrl: string | null;
  notificationEmail: string | null;
}

export interface Tenant {
  id: string;
  slug: string;
  name: string;
  domain: string | null;
  plan: PlanTier;
  status: TenantStatus;
  onboardingState: OnboardingState;
  settings: TenantSettings;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface TenantConfig {
  tenantId: string;
  plan: PlanTier;
  domain: string | null;
  oauthTokens: OAuthTokenSet;
  settings: TenantSettings;
}

export interface OAuthTokenSet {
  google?: OAuthToken;
  meta?: OAuthToken;
  linkedin?: OAuthToken;
  hubspot?: OAuthToken;
  salesforce?: OAuthToken;
}

export interface OAuthToken {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  scopes: string[];
  provider: OAuthProvider;
}

export type OAuthProvider = 'google' | 'meta' | 'linkedin' | 'hubspot' | 'salesforce';

export interface TenantUser {
  id: string;
  tenantId: string;
  email: string;
  name: string;
  role: UserRole;
  avatarUrl: string | null;
  lastLoginAt: Date | null;
  createdAt: Date;
}

export type UserRole = 'owner' | 'admin' | 'member' | 'viewer';

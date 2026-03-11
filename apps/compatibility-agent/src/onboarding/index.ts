/**
 * Onboarding module barrel export
 */

export {
  initiateOnboarding,
  runDetection,
  generateConnectionUrls,
  markPlatformConnected,
  markPlatformFailed,
  transitionToActivating,
  completeOnboarding,
  getOnboardingContext,
  type OnboardingContext,
  type OnboardingState,
} from './onboarding-engine.js';

export { processOAuthCallback, connectApiKeyPlatforms, type ParallelConnectionResult } from './parallel-connector.js';
export { runInstantAudit, type InstantAuditReport, type AuditResult } from './instant-audit.js';
export { activateAgents, planAgentActivation, type ActivationPlan } from './agent-activator.js';
export { extractBrandProfile, type BrandProfile } from './brand-extractor.js';

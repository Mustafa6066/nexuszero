/**
 * Scope Validator — Verifies that OAuth integrations still have the required scopes.
 */

import type { ScopeValidation, Platform } from '@nexuszero/shared';
import { requirePlatformDefinition } from '@nexuszero/shared';

/** Validate that current scopes include all required scopes */
export function validateScopes(
  granted: string[],
  required: string[],
): ScopeValidation {
  const grantedSet = new Set(granted);
  const missing = required.filter(s => !grantedSet.has(s));

  return {
    valid: missing.length === 0,
    granted,
    required,
    missing,
  };
}

/** Get the minimum required scopes for a platform */
export function getRequiredScopes(platform: Platform): string[] {
  const def = requirePlatformDefinition(platform);
  return def.oauth?.defaultScopes ?? [];
}

/** Check if a scope set has enough permissions for a given action */
export function hasPermissionForAction(
  scopes: string[],
  platform: Platform,
  action: string,
): boolean {
  const scopeSet = new Set(scopes);

  // Platform-specific action → scope mapping
  const actionScopeMap: Partial<Record<Platform, Record<string, string[]>>> = {
    google_analytics: {
      get_traffic: ['https://www.googleapis.com/auth/analytics.readonly'],
      get_conversions: ['https://www.googleapis.com/auth/analytics.readonly'],
      edit_config: ['https://www.googleapis.com/auth/analytics.edit'],
    },
    google_ads: {
      get_campaigns: ['https://www.googleapis.com/auth/adwords'],
      create_campaign: ['https://www.googleapis.com/auth/adwords'],
      update_bids: ['https://www.googleapis.com/auth/adwords'],
    },
    hubspot: {
      get_contacts: ['crm.objects.contacts.read'],
      create_contact: ['crm.objects.contacts.write'],
      get_deals: ['crm.objects.deals.read'],
    },
    meta_ads: {
      get_campaigns: ['ads_read'],
      create_campaign: ['ads_management'],
      get_insights: ['ads_read'],
    },
  };

  const platformMap = actionScopeMap[platform];
  if (!platformMap) return true; // If no mapping, assume permission is granted

  const required = platformMap[action];
  if (!required) return true;

  return required.every(s => scopeSet.has(s));
}

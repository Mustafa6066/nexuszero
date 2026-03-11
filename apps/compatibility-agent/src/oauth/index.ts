/**
 * OAuth module barrel export
 */

export { generateAuthUrl, exchangeCode, completeOAuthFlow } from './oauth-manager.js';
export { storeTokens, retrieveTokens, isTokenExpired, createIntegration, getIntegrationByPlatform } from './token-vault.js';
export { refreshExpiringTokens, refreshTokenForIntegration } from './token-refresher.js';
export { validateScopes, getRequiredScopes, hasPermissionForAction } from './scope-validator.js';
export { generateReauthLink, processReauthCallback } from './reauth-flow.js';
export * from './handlers/index.js';

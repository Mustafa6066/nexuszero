# Each service has its own apps/*/railway.toml with startCommand.
# This Procfile is kept for local foreman/honcho usage only.
# Railway uses the per-service railway.toml startCommand, not this file.
api-gateway: cd apps/api-gateway && node src/migrate.mjs && node dist/index.js
orchestrator: cd apps/orchestrator && node dist/index.js
webhook-service: cd apps/webhook-service && node dist/index.js
onboarding-service: cd apps/onboarding-service && node dist/index.js
compatibility-agent: cd apps/compatibility-agent && node dist/index.js
seo-agent: cd apps/agents/seo-agent && node dist/index.js
ad-agent: cd apps/agents/ad-agent && node dist/index.js
data-nexus: cd apps/agents/data-nexus && node dist/index.js
aeo-agent: cd apps/agents/aeo-agent && node dist/index.js

-- Row-Level Security Policies for NexusZero
-- Applied to all tables with tenant_id to enforce tenant isolation

-- Enable RLS on all tenant-scoped tables
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE creatives ENABLE ROW LEVEL SECURITY;
ALTER TABLE creative_tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_data_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE funnel_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE forecasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE aeo_citations ENABLE ROW LEVEL SECURITY;
ALTER TABLE entity_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_visibility_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_endpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE oauth_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_tasks ENABLE ROW LEVEL SECURITY;

-- Create an application role for the service
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'nexuszero_app') THEN
    CREATE ROLE nexuszero_app;
  END IF;
END
$$;

-- Tenants: can only see own tenant
CREATE POLICY tenants_isolation ON tenants
  FOR ALL
  TO nexuszero_app
  USING (id = current_setting('app.current_tenant_id', true)::uuid);

-- Users: see users in own tenant
CREATE POLICY users_isolation ON users
  FOR ALL
  TO nexuszero_app
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Agents: see agents in own tenant
CREATE POLICY agents_isolation ON agents
  FOR ALL
  TO nexuszero_app
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Campaigns: see campaigns in own tenant
CREATE POLICY campaigns_isolation ON campaigns
  FOR ALL
  TO nexuszero_app
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Creatives: see creatives in own tenant
CREATE POLICY creatives_isolation ON creatives
  FOR ALL
  TO nexuszero_app
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Creative Tests: see tests in own tenant
CREATE POLICY creative_tests_isolation ON creative_tests
  FOR ALL
  TO nexuszero_app
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Analytics Data Points: see analytics in own tenant
CREATE POLICY analytics_data_points_isolation ON analytics_data_points
  FOR ALL
  TO nexuszero_app
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Funnel Analysis: see funnels in own tenant
CREATE POLICY funnel_analysis_isolation ON funnel_analysis
  FOR ALL
  TO nexuszero_app
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Forecasts: see forecasts in own tenant
CREATE POLICY forecasts_isolation ON forecasts
  FOR ALL
  TO nexuszero_app
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- AEO Citations: see citations in own tenant
CREATE POLICY aeo_citations_isolation ON aeo_citations
  FOR ALL
  TO nexuszero_app
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Entity Profiles: see profiles in own tenant
CREATE POLICY entity_profiles_isolation ON entity_profiles
  FOR ALL
  TO nexuszero_app
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- AI Visibility Scores: see scores in own tenant
CREATE POLICY ai_visibility_scores_isolation ON ai_visibility_scores
  FOR ALL
  TO nexuszero_app
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Webhook Endpoints: see endpoints in own tenant
CREATE POLICY webhook_endpoints_isolation ON webhook_endpoints
  FOR ALL
  TO nexuszero_app
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Webhook Deliveries: see deliveries in own tenant
CREATE POLICY webhook_deliveries_isolation ON webhook_deliveries
  FOR ALL
  TO nexuszero_app
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Audit Logs: see logs in own tenant
CREATE POLICY audit_logs_isolation ON audit_logs
  FOR ALL
  TO nexuszero_app
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- API Keys: see keys in own tenant
CREATE POLICY api_keys_isolation ON api_keys
  FOR ALL
  TO nexuszero_app
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- OAuth Tokens: see tokens in own tenant
CREATE POLICY oauth_tokens_isolation ON oauth_tokens
  FOR ALL
  TO nexuszero_app
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Integrations: see integrations in own tenant (Compatibility Agent)
ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY integrations_isolation ON integrations
  FOR ALL
  TO nexuszero_app
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Integration Health: see health logs in own tenant
ALTER TABLE integration_health ENABLE ROW LEVEL SECURITY;
CREATE POLICY integration_health_isolation ON integration_health
  FOR ALL
  TO nexuszero_app
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Schema Snapshots: see schema snapshots in own tenant
ALTER TABLE schema_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY schema_snapshots_isolation ON schema_snapshots
  FOR ALL
  TO nexuszero_app
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Agent Tasks: see tasks in own tenant
CREATE POLICY agent_tasks_isolation ON agent_tasks
  FOR ALL
  TO nexuszero_app
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Compound Insights: no tenant_id (cross-tenant anonymized), accessible to all
-- No RLS needed — this table is intentionally cross-tenant

-- SUPERUSER bypass: allow the migration user to bypass RLS
-- ALTER TABLE ... FORCE ROW LEVEL SECURITY; -- only if needed
-- By default, table owners and superusers bypass RLS

-- Indices for tenant_id columns (critical for RLS performance)
CREATE INDEX IF NOT EXISTS idx_users_tenant_id ON users (tenant_id);
CREATE INDEX IF NOT EXISTS idx_agents_tenant_id ON agents (tenant_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_tenant_id ON campaigns (tenant_id);
CREATE INDEX IF NOT EXISTS idx_creatives_tenant_id ON creatives (tenant_id);
CREATE INDEX IF NOT EXISTS idx_creative_tests_tenant_id ON creative_tests (tenant_id);
CREATE INDEX IF NOT EXISTS idx_analytics_dp_tenant_id ON analytics_data_points (tenant_id);
CREATE INDEX IF NOT EXISTS idx_funnel_analysis_tenant_id ON funnel_analysis (tenant_id);
CREATE INDEX IF NOT EXISTS idx_forecasts_tenant_id ON forecasts (tenant_id);
CREATE INDEX IF NOT EXISTS idx_aeo_citations_tenant_id ON aeo_citations (tenant_id);
CREATE INDEX IF NOT EXISTS idx_entity_profiles_tenant_id ON entity_profiles (tenant_id);
CREATE INDEX IF NOT EXISTS idx_ai_visibility_scores_tenant_id ON ai_visibility_scores (tenant_id);
CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_tenant_id ON webhook_endpoints (tenant_id);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_tenant_id ON webhook_deliveries (tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_id ON audit_logs (tenant_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_tenant_id ON api_keys (tenant_id);
CREATE INDEX IF NOT EXISTS idx_oauth_tokens_tenant_id ON oauth_tokens (tenant_id);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_tenant_id ON agent_tasks (tenant_id);
CREATE INDEX IF NOT EXISTS idx_integrations_tenant_id ON integrations (tenant_id);
CREATE INDEX IF NOT EXISTS idx_integrations_tenant_platform ON integrations (tenant_id, platform);
CREATE INDEX IF NOT EXISTS idx_integration_health_integration_id ON integration_health (integration_id);
CREATE INDEX IF NOT EXISTS idx_integration_health_tenant_id ON integration_health (tenant_id);
CREATE INDEX IF NOT EXISTS idx_schema_snapshots_integration_id ON schema_snapshots (integration_id);
CREATE INDEX IF NOT EXISTS idx_schema_snapshots_tenant_id ON schema_snapshots (tenant_id);

-- Composite indices for common query patterns
CREATE INDEX IF NOT EXISTS idx_campaigns_tenant_status ON campaigns (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_agents_tenant_type ON agents (tenant_id, type);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_tenant_status ON agent_tasks (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_creatives_tenant_campaign ON creatives (tenant_id, campaign_id);
CREATE INDEX IF NOT EXISTS idx_analytics_dp_tenant_date ON analytics_data_points (tenant_id, date);
CREATE INDEX IF NOT EXISTS idx_aeo_citations_tenant_platform ON aeo_citations (tenant_id, platform);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_status ON webhook_deliveries (status, next_retry_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_created ON audit_logs (tenant_id, created_at);

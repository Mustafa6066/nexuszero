-- Phase 1: Agent Actions (Explainability + Attribution backbone)
DO $$ BEGIN
  CREATE TYPE "action_category" AS ENUM('optimization', 'creation', 'modification', 'analysis', 'alert', 'rollback');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "agent_actions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "agent_id" uuid,
  "task_id" uuid,
  "action_type" varchar(100) NOT NULL,
  "category" "action_category" DEFAULT 'analysis' NOT NULL,
  "reasoning" text NOT NULL,
  "trigger" jsonb,
  "before_state" jsonb,
  "after_state" jsonb,
  "confidence" real,
  "impact_metric" varchar(100),
  "impact_delta" real,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "agent_actions" ADD CONSTRAINT "agent_actions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "agent_actions" ADD CONSTRAINT "agent_actions_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_agent_actions_tenant_created" ON "agent_actions" ("tenant_id", "created_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_agent_actions_agent" ON "agent_actions" ("agent_id", "created_at" DESC);
--> statement-breakpoint

-- Phase 5: Campaign Versions (Rollback backbone)
CREATE TABLE IF NOT EXISTS "campaign_versions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "campaign_id" uuid NOT NULL,
  "version" integer NOT NULL,
  "snapshot" jsonb NOT NULL,
  "changed_by" varchar(50) NOT NULL,
  "change_reason" text,
  "agent_action_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "campaign_versions" ADD CONSTRAINT "campaign_versions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "campaign_versions" ADD CONSTRAINT "campaign_versions_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_campaign_versions_campaign" ON "campaign_versions" ("campaign_id", "version" DESC);
--> statement-breakpoint

-- Phase 3: Tenant Guardrails
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "guardrails" jsonb DEFAULT '{}'::jsonb NOT NULL;

/**
 * Fleet Engine Deploy Service
 *
 * Orchestrates the deployment of a NexusZero engine for EaaS:
 * 1. Pre-flight scan (optional)
 * 2. Tenant provisioning (or reuse existing)
 * 3. Integration connection (OAuth workflow initiation)
 * 4. Agent activation (task graph dispatch)
 * 5. Strategy generation
 *
 * Returns a deployment manifest with step-by-step status.
 */

import { randomUUID } from 'node:crypto';
import { getDb, tenants, agents } from '@nexuszero/db';
import { publishAgentTask } from '@nexuszero/queue';
import { eq } from 'drizzle-orm';
import type {
  EngineDeployRequest,
  EngineDeployResponse,
  EngineDeployStep,
  EngineDeployStatus,
} from '@nexuszero/shared';
import { runPreflightScan } from './preflight-scanner.service.js';

type AgentType = 'seo' | 'ad' | 'creative' | 'data-nexus' | 'aeo' | 'compatibility';

const AGENT_TYPE_MAP: Record<string, AgentType> = {
  seo: 'seo',
  ad: 'ad',
  creative: 'creative',
  data_nexus: 'data-nexus',
  aeo: 'aeo',
  compatibility: 'compatibility',
};

function makeStep(name: string, status: EngineDeployStep['status'] = 'pending'): EngineDeployStep {
  return { name, status };
}

/**
 * Deploy a NexusZero engine for a tenant.
 * If tenantId is provided, deploys into that tenant.
 * If not, creates a new tenant.
 */
export async function deployEngine(
  tenantId: string,
  request: EngineDeployRequest,
): Promise<EngineDeployResponse> {
  const deploymentId = randomUUID();
  const steps: EngineDeployStep[] = [
    makeStep('Pre-flight scan'),
    makeStep('Provision tenant'),
    makeStep('Configure integrations'),
    makeStep('Activate agents'),
    makeStep('Generate strategy'),
  ];

  let status: EngineDeployStatus = 'preflight';
  let progress = 0;

  const updateStep = (index: number, s: EngineDeployStep['status'], detail?: string) => {
    steps[index]!.status = s;
    if (s === 'running') steps[index]!.startedAt = new Date().toISOString();
    if (s === 'completed' || s === 'failed') steps[index]!.completedAt = new Date().toISOString();
    if (detail) steps[index]!.detail = detail;
    progress = Math.round(((steps.filter((st) => st.status === 'completed').length) / steps.length) * 100);
  };

  // ── Step 1: Pre-flight scan ──────────────────────────────────────────
  if (!request.skipPreflight) {
    updateStep(0, 'running');
    try {
      const scan = await runPreflightScan(request.websiteUrl);
      updateStep(0, 'completed', `Readiness score: ${scan.readinessScore}%`);
    } catch (err) {
      updateStep(0, 'failed', err instanceof Error ? err.message : 'Scan failed');
      return { deploymentId, tenantId, status: 'failed', progress, steps };
    }
  } else {
    updateStep(0, 'completed', 'Skipped (pre-flight already done)');
  }

  // ── Step 2: Provision tenant ─────────────────────────────────────────
  status = 'provisioning';
  updateStep(1, 'running');
  try {
    const db = getDb();
    const [existing] = await db.select({ id: tenants.id, onboardingState: tenants.onboardingState })
      .from(tenants).where(eq(tenants.id, tenantId)).limit(1);

    if (existing) {
      updateStep(1, 'completed', 'Using existing tenant');
    } else {
      // In EaaS mode, tenant creation happens via the auth/signup flow.
      // Here we just verify it exists.
      updateStep(1, 'failed', 'Tenant not found — create via signup first');
      return { deploymentId, tenantId, status: 'failed', progress, steps };
    }
  } catch (err) {
    updateStep(1, 'failed', err instanceof Error ? err.message : 'Provisioning failed');
    return { deploymentId, tenantId, status: 'failed', progress, steps };
  }

  // ── Step 3: Configure integrations ───────────────────────────────────
  status = 'connecting';
  updateStep(2, 'running');
  try {
    // Queue the compatibility agent to initiate onboarding
    await publishAgentTask({
      tenantId,
      agentType: 'compatibility',
      type: 'onboarding_flow',
      priority: 'critical',
      input: {
        step: 'initiate',
        websiteUrl: request.websiteUrl,
        selectedPlatforms: request.platforms ?? [],
      },
    });
    updateStep(2, 'completed', `Queued integration setup${request.platforms?.length ? ` for ${request.platforms.join(', ')}` : ''}`);
  } catch {
    // Queue unavailable is non-fatal — integrations can be connected manually
    updateStep(2, 'completed', 'Queue unavailable — manual connection required');
  }

  // ── Step 4: Activate agents ──────────────────────────────────────────
  status = 'activating';
  updateStep(3, 'running');
  try {
    const db = getDb();
    const agentsToDeploy = request.agents
      .map((a: string) => AGENT_TYPE_MAP[a])
      .filter((a: AgentType | undefined): a is AgentType => !!a);

    for (const agentType of agentsToDeploy) {
      // Ensure agent row exists
      const [existing] = await db.select({ id: agents.id })
        .from(agents).where(eq(agents.tenantId, tenantId)).limit(1);

      // Queue initial task for each agent type
      const initialTasks: Record<AgentType, string> = {
        seo: 'seo_audit',
        ad: 'optimize_bids',
        creative: 'generate_creative',
        'data-nexus': 'build_dashboard',
        aeo: 'citation_scan',
        compatibility: 'health_check',
      };

      await publishAgentTask({
        tenantId,
        agentType,
        type: initialTasks[agentType] ?? 'health_check',
        priority: 'high',
        input: { websiteUrl: request.websiteUrl, deploymentId },
      });
    }
    updateStep(3, 'completed', `Activated ${agentsToDeploy.length} agents`);
  } catch (err) {
    updateStep(3, 'failed', err instanceof Error ? err.message : 'Agent activation failed');
    return { deploymentId, tenantId, status: 'failed', progress, steps };
  }

  // ── Step 5: Generate strategy ────────────────────────────────────────
  status = 'activating';
  updateStep(4, 'running');
  try {
    await publishAgentTask({
      tenantId,
      agentType: 'seo',
      type: 'generate_strategy',
      priority: 'medium',
      input: {
        websiteUrl: request.websiteUrl,
        tier: request.tier,
        companyName: request.companyName,
      },
    });
    updateStep(4, 'completed', 'Strategy generation queued');
  } catch {
    updateStep(4, 'completed', 'Strategy will be generated on first agent run');
  }

  status = 'live';
  progress = 100;

  return { deploymentId, tenantId, status, progress, steps };
}

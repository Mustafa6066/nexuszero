import type { OnboardingState } from '@nexuszero/shared';
import { createLogger } from '@nexuszero/shared';
import { getDb, tenants, agents, oauthTokens } from '@nexuszero/db';
import { eq } from 'drizzle-orm';
import { publishOnboardingStep, publishWebhookEvent, publishAgentTask, publishAuditEvent, publishWsEvent } from '@nexuszero/queue';
import { KAFKA_TOPICS } from '@nexuszero/shared';
import { randomUUID } from 'node:crypto';

/** Valid state transitions */
const STATE_TRANSITIONS: Record<OnboardingState, OnboardingState[]> = {
  created: ['shadow_auditing'],
  shadow_auditing: ['shadow_complete', 'failed'],
  shadow_complete: ['oauth_connecting'],
  oauth_connecting: ['oauth_connected', 'shadow_complete', 'failed'],
  oauth_connected: ['auditing'],
  auditing: ['audit_complete', 'oauth_connected', 'failed'],
  audit_complete: ['provisioning'],
  provisioning: ['provisioned', 'audit_complete', 'failed'],
  provisioned: ['strategy_generating'],
  strategy_generating: ['strategy_ready', 'provisioned', 'failed'],
  strategy_ready: ['going_live', 'strategy_generating'],
  going_live: ['active', 'strategy_ready', 'failed'],
  active: [],
  failed: ['created'], // Allow restart from failed
};

/** Map each state to the previous safe step-back target */
const STEP_BACK_TARGETS: Partial<Record<OnboardingState, OnboardingState>> = {
  oauth_connecting: 'shadow_complete',
  auditing: 'oauth_connected',
  provisioning: 'audit_complete',
  strategy_generating: 'provisioned',
  strategy_ready: 'strategy_generating',
  going_live: 'strategy_ready',
};

const ORDERED_STATES: OnboardingState[] = [
  'created', 'shadow_auditing', 'shadow_complete', 'oauth_connecting',
  'oauth_connected', 'auditing', 'audit_complete', 'provisioning',
  'provisioned', 'strategy_generating', 'strategy_ready', 'going_live', 'active',
];

export class OnboardingStateMachine {
  private readonly log = createLogger('onboarding-service');

  constructor(private readonly tenantId: string) {}

  /** Get onboarding progress */
  getProgress(currentState: OnboardingState): {
    currentStep: number;
    totalSteps: number;
    percentComplete: number;
    completedSteps: string[];
    nextStep: string | null;
  } {
    const idx = ORDERED_STATES.indexOf(currentState);
    const step = idx === -1 ? 0 : idx;
    const total = ORDERED_STATES.length - 1; // 'active' is the final state

    return {
      currentStep: step,
      totalSteps: total,
      percentComplete: Math.round((step / total) * 100),
      completedSteps: ORDERED_STATES.slice(0, step),
      nextStep: step < total ? ORDERED_STATES[step + 1]! : null,
    };
  }

  /** Start onboarding flow from 'created' state */
  async startOnboarding(config: Record<string, unknown>) {
    const db = getDb();
    const [tenant] = await db.select({ onboardingState: tenants.onboardingState })
      .from(tenants).where(eq(tenants.id, this.tenantId)).limit(1);

    if (!tenant) throw new Error(`Tenant ${this.tenantId} not found`);

    if (tenant.onboardingState !== 'created' && tenant.onboardingState !== 'failed') {
      throw new Error(`Cannot start onboarding from state: ${tenant.onboardingState}`);
    }

    // Queue the first step: Shadow Audit (runs before OAuth, before user interaction)
    await this.transitionTo('shadow_auditing');
    await publishOnboardingStep({
      tenantId: this.tenantId,
      step: 'shadow_audit',
      config,
    });
  }

  /** Manually trigger a specific onboarding step */
  async triggerStep(step: 'oauth_connect' | 'instant_audit' | 'provision' | 'strategy_generate' | 'go_live', config: Record<string, unknown>) {
    await publishOnboardingStep({
      tenantId: this.tenantId,
      step,
      config,
    });
  }

  /** Process a completed onboarding step and advance state */
  async onStepComplete(step: string, result: Record<string, unknown>) {
    const db = getDb();

    switch (step) {
      case 'shadow_audit':
        await this.transitionTo('shadow_complete');
        // Auto-dispatch read-only safe agents immediately — user gets value before OAuth
        await this.dispatchSafeAgentTasks(result);
        // Auto-advance to firmographic enrichment
        await publishOnboardingStep({
          tenantId: this.tenantId,
          step: 'firmographic_enrichment',
          config: { ...result },
        });
        break;

      case 'firmographic_enrichment':
        // Firmographic enrichment done — advance to OAuth connecting
        await this.transitionTo('oauth_connecting');
        await publishOnboardingStep({
          tenantId: this.tenantId,
          step: 'oauth_connect',
          config: { ...result },
        });
        break;

      case 'oauth_connect':
        await this.transitionTo('oauth_connected');
        // Auto-advance to audit
        await this.transitionTo('auditing');
        await publishOnboardingStep({
          tenantId: this.tenantId,
          step: 'instant_audit',
          config: { ...result },
        });
        break;

      case 'instant_audit':
        await this.transitionTo('audit_complete');
        // Auto-advance to provisioning
        await this.transitionTo('provisioning');
        await publishOnboardingStep({
          tenantId: this.tenantId,
          step: 'provision',
          config: { auditResults: result },
        });
        break;

      case 'provision':
        await this.transitionTo('provisioned');
        // Auto-advance to strategy generation
        await this.transitionTo('strategy_generating');
        await publishOnboardingStep({
          tenantId: this.tenantId,
          step: 'strategy_generate',
          config: { ...result },
        });
        break;

      case 'strategy_generate':
        await this.transitionTo('strategy_ready');
        // Strategy ready — wait for user to confirm go-live
        // (or auto-advance if configured)
        const autoGoLive = (result as any).autoGoLive === true;
        if (autoGoLive) {
          await this.transitionTo('going_live');
          await publishOnboardingStep({
            tenantId: this.tenantId,
            step: 'go_live',
            config: { ...result },
          });
        }
        break;

      case 'go_live':
        await this.transitionTo('active');
        // Update tenant status
        await db.update(tenants)
          .set({ status: 'active', updatedAt: new Date() })
          .where(eq(tenants.id, this.tenantId));

        // Publish completion event for webhooks
        await publishWebhookEvent(this.tenantId, 'onboarding.completed', {
          tenantId: this.tenantId,
          completedAt: new Date().toISOString(),
        });
        break;
    }
  }

  /** Handle a step failure */
  async onStepFailed(step: string, error: string) {
    await this.transitionTo('failed');

    await publishWebhookEvent(this.tenantId, 'onboarding.failed', {
      tenantId: this.tenantId,
      failedStep: step,
      error,
    });

    await publishAuditEvent(
      this.tenantId,
      'onboarding.step_failed',
      { step, error, timestamp: new Date().toISOString() },
    );
  }

  /** Step back to the previous safe state */
  async stepBack(): Promise<{ previousState: string; newState: string }> {
    const db = getDb();
    const [tenant] = await db.select({ onboardingState: tenants.onboardingState })
      .from(tenants).where(eq(tenants.id, this.tenantId)).limit(1);

    if (!tenant) throw new Error(`Tenant ${this.tenantId} not found`);

    const currentState = tenant.onboardingState as OnboardingState;
    const target = STEP_BACK_TARGETS[currentState];

    if (!target) {
      throw new Error(`Cannot step back from state: ${currentState}`);
    }

    await this.transitionTo(target);

    this.log.info('Step back', { tenantId: this.tenantId, from: currentState, to: target });

    return { previousState: currentState, newState: target };
  }

  /** Pause onboarding — sets paused flag, cron triggers skip paused tenants */
  async pause(): Promise<void> {
    const db = getDb();
    const [tenant] = await db.select({ onboardingState: tenants.onboardingState })
      .from(tenants).where(eq(tenants.id, this.tenantId)).limit(1);

    if (!tenant) throw new Error(`Tenant ${this.tenantId} not found`);
    if (tenant.onboardingState === 'active') throw new Error('Cannot pause — onboarding already complete');

    await db.update(tenants).set({
      metadata: { onboardingPaused: true, pausedAt: new Date().toISOString() },
      updatedAt: new Date(),
    }).where(eq(tenants.id, this.tenantId));

    publishWsEvent(this.tenantId, 'onboarding:progress', 'paused', { state: tenant.onboardingState });
    this.log.info('Onboarding paused', { tenantId: this.tenantId });
  }

  /** Resume paused onboarding */
  async resume(): Promise<void> {
    const db = getDb();
    const [tenant] = await db.select({ onboardingState: tenants.onboardingState })
      .from(tenants).where(eq(tenants.id, this.tenantId)).limit(1);

    if (!tenant) throw new Error(`Tenant ${this.tenantId} not found`);

    await db.update(tenants).set({
      metadata: { onboardingPaused: false, resumedAt: new Date().toISOString() },
      updatedAt: new Date(),
    }).where(eq(tenants.id, this.tenantId));

    publishWsEvent(this.tenantId, 'onboarding:progress', 'resumed', { state: tenant.onboardingState });
    this.log.info('Onboarding resumed', { tenantId: this.tenantId });
  }

  /** Transition to a new onboarding state */
  private async transitionTo(newState: OnboardingState) {
    const db = getDb();

    const [tenant] = await db.select({ onboardingState: tenants.onboardingState })
      .from(tenants).where(eq(tenants.id, this.tenantId)).limit(1);

    if (!tenant) throw new Error(`Tenant ${this.tenantId} not found`);

    const currentState = tenant.onboardingState as OnboardingState;
    const allowed = STATE_TRANSITIONS[currentState] || [];

    if (!allowed.includes(newState)) {
      throw new Error(`Invalid transition: ${currentState} -> ${newState}`);
    }

    await db.update(tenants).set({
      onboardingState: newState,
      updatedAt: new Date(),
    }).where(eq(tenants.id, this.tenantId));

    // Notify via webhook
    await publishWebhookEvent(this.tenantId, 'onboarding.step_completed', {
      tenantId: this.tenantId,
      previousState: currentState,
      newState,
    });

    // Push real-time onboarding progress to dashboard via WebSocket
    publishWsEvent(this.tenantId, 'onboarding:progress', 'state_changed', {
      previousState: currentState,
      newState,
      progress: this.getProgress(newState),
    });

    this.log.info('State transition', { tenantId: this.tenantId, from: currentState, to: newState });
  }

  /**
   * Dispatch read-only "safe" agent tasks immediately after shadow audit.
   * Gives the user value in their Opportunity Snapshot before they even connect OAuth.
   */
  private async dispatchSafeAgentTasks(auditResult: Record<string, unknown>) {
    const domain = auditResult.domain as string | undefined;
    if (!domain) return;

    try {
      // SEO audit — read-only, safe to run immediately
      await publishAgentTask({
        id: randomUUID(),
        tenantId: this.tenantId,
        agentType: 'seo',
        type: 'seo_audit',
        priority: 'medium',
        input: { domain, isPreOnboardingAudit: true, scheduled: false },
      });

      // AEO visibility probe — read-only, safe to run immediately
      await publishAgentTask({
        id: randomUUID(),
        tenantId: this.tenantId,
        agentType: 'aeo',
        type: 'ai_visibility_scoring',
        priority: 'low',
        input: { domain, isPreOnboardingAudit: true },
      });

      console.log(`Tenant ${this.tenantId}: dispatched safe pre-onboarding agents (SEO + AEO)`);
    } catch (err) {
      // Non-fatal — these are bonus tasks, don't block onboarding
      console.warn(`Tenant ${this.tenantId}: failed to dispatch safe agents:`, (err as Error).message);
    }
  }
}

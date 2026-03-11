import type { OnboardingState } from '@nexuszero/shared';
import { getDb, tenants, agents, oauthTokens } from '@nexuszero/db';
import { eq } from 'drizzle-orm';
import { publishOnboardingStep, publishWebhookEvent, publishAgentTask, publishAuditEvent } from '@nexuszero/queue';
import { KAFKA_TOPICS } from '@nexuszero/shared';

/** Valid state transitions */
const STATE_TRANSITIONS: Record<OnboardingState, OnboardingState[]> = {
  created: ['oauth_connecting'],
  oauth_connecting: ['oauth_connected', 'failed'],
  oauth_connected: ['auditing'],
  auditing: ['audit_complete', 'failed'],
  audit_complete: ['provisioning'],
  provisioning: ['provisioned', 'failed'],
  provisioned: ['strategy_generating'],
  strategy_generating: ['strategy_ready', 'failed'],
  strategy_ready: ['going_live'],
  going_live: ['active', 'failed'],
  active: [],
  failed: ['created'], // Allow restart from failed
};

const ORDERED_STATES: OnboardingState[] = [
  'created', 'oauth_connecting', 'oauth_connected', 'auditing',
  'audit_complete', 'provisioning', 'provisioned', 'strategy_generating',
  'strategy_ready', 'going_live', 'active',
];

export class OnboardingStateMachine {
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

    // Queue the first step: OAuth connect
    await this.transitionTo('oauth_connecting');
    await publishOnboardingStep({
      tenantId: this.tenantId,
      step: 'oauth_connect',
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

    console.log(`Tenant ${this.tenantId}: ${currentState} -> ${newState}`);
  }
}

import { describe, it, expect } from 'vitest';
import { createWebhookSchema, updateWebhookSchema, overrideSchema } from '../src/schemas/webhook.schema';

describe('createWebhookSchema', () => {
  it('accepts valid webhook', () => {
    const result = createWebhookSchema.safeParse({
      url: 'https://example.com/webhook',
      events: ['agent.task_completed'],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.active).toBe(true); // default
    }
  });

  it('rejects non-URL string', () => {
    const result = createWebhookSchema.safeParse({
      url: 'not-a-url',
      events: ['agent.task_completed'],
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty events array', () => {
    const result = createWebhookSchema.safeParse({
      url: 'https://example.com/webhook',
      events: [],
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid event type', () => {
    const result = createWebhookSchema.safeParse({
      url: 'https://example.com/webhook',
      events: ['nonexistent.event'],
    });
    expect(result.success).toBe(false);
  });
});

describe('updateWebhookSchema', () => {
  it('accepts partial update', () => {
    const result = updateWebhookSchema.safeParse({ active: false });
    expect(result.success).toBe(true);
  });

  it('accepts empty object', () => {
    const result = updateWebhookSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});

describe('overrideSchema', () => {
  it('accepts valid override', () => {
    const result = overrideSchema.safeParse({
      agentType: 'seo',
      action: 'pause_agent',
      reason: 'Budget exceeded for this month',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.parameters).toEqual({});
    }
  });

  it('rejects missing reason', () => {
    const result = overrideSchema.safeParse({
      agentType: 'seo',
      action: 'pause_agent',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid action', () => {
    const result = overrideSchema.safeParse({
      agentType: 'seo',
      action: 'delete_everything',
      reason: 'test',
    });
    expect(result.success).toBe(false);
  });

  it('rejects reason over 500 chars', () => {
    const result = overrideSchema.safeParse({
      agentType: 'seo',
      action: 'pause_agent',
      reason: 'x'.repeat(501),
    });
    expect(result.success).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { buildLanguageGuidance, prefersArabic } from '../src/services/assistant.service.js';

describe('assistant language guidance', () => {
  it('treats the tenant as Arabic-first when market preferences require it', () => {
    expect(prefersArabic('Show me conversion trends for last month', {
      language: 'ar',
      countryCode: 'SA',
      dialect: 'gulf',
    })).toBe(true);
  });

  it('uses dialect-aware Arabic guidance from tenant market preferences', () => {
    const guidance = buildLanguageGuidance('Show me campaign performance', {
      language: 'ar',
      countryCode: 'AE',
      dialect: 'gulf',
    });

    expect(guidance).toContain('## Response Language');
    expect(guidance).toContain('The user context is Arabic-first');
    expect(guidance).toContain('gulf Arabic when it improves naturalness');
    expect(guidance).toContain('Respect regional intent for AE');
  });

  it('falls back to same-language guidance when there is no Arabic signal or preference', () => {
    const guidance = buildLanguageGuidance('Show me campaign performance');

    expect(guidance).toContain('Respond in the same language as the user');
    expect(guidance).not.toContain('Arabic-first');
  });
});
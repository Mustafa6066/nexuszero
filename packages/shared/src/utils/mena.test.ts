import { describe, expect, it } from 'vitest';
import { enforceRtlHtmlDocument, resolveMarketContext } from './mena';

describe('MENA utilities', () => {
  it('infers Arabic MENA context and dialect from tenant market preferences', () => {
    const context = resolveMarketContext({
      language: 'ar',
      dialect: 'auto',
      countryCode: 'EG',
      city: 'Cairo',
      prompt: 'أفضل مكتب محاماة للشركات',
    });

    expect(context.isArabic).toBe(true);
    expect(context.isMena).toBe(true);
    expect(context.direction).toBe('rtl');
    expect(context.dialect).toBe('egyptian');
  });

  it('forces lang and dir attributes plus RTL-safe styling into landing-page markup', () => {
    const html = enforceRtlHtmlDocument('<!DOCTYPE html><html><head></head><body><main><h1>مرحبا</h1></main></body></html>');

    expect(html).toContain('lang="ar"');
    expect(html).toContain('dir="rtl"');
    expect(html).toContain('font-family:Tajawal');
    expect(html).toContain('direction:rtl');
  });
});
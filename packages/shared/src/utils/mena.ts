const ARABIC_SCRIPT_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/u;

const MENA_COUNTRIES = new Set([
  'AE', 'BH', 'DZ', 'EG', 'IQ', 'JO', 'KW', 'LB', 'LY', 'MA', 'OM', 'PS', 'QA', 'SA', 'SD', 'SY', 'TN', 'YE',
]);

export type ArabicDialect = 'auto' | 'msa' | 'egyptian' | 'gulf' | 'levantine' | 'maghrebi';
export type ScriptDirection = 'rtl' | 'ltr';

export interface MarketContextInput {
  language?: string | null;
  dialect?: ArabicDialect | null;
  countryCode?: string | null;
  region?: string | null;
  city?: string | null;
  direction?: ScriptDirection | null;
  keywords?: string[];
  prompt?: string | null;
  audience?: string | null;
}

export interface ResolvedMarketContext {
  language: string;
  dialect: ArabicDialect;
  countryCode: string | null;
  region: string | null;
  city: string | null;
  direction: ScriptDirection;
  isArabic: boolean;
  isMena: boolean;
  localIntentHints: string[];
}

function normalizeCountryCode(countryCode?: string | null): string | null {
  if (!countryCode) {
    return null;
  }

  const normalized = countryCode.trim().toUpperCase();
  return normalized.length === 2 ? normalized : null;
}

export function containsArabicScript(value: string | null | undefined): boolean {
  if (!value) {
    return false;
  }

  return ARABIC_SCRIPT_RE.test(value);
}

function inferDialect(countryCode: string | null, requestedDialect?: ArabicDialect | null): ArabicDialect {
  if (requestedDialect && requestedDialect !== 'auto') {
    return requestedDialect;
  }

  switch (countryCode) {
    case 'EG':
      return 'egyptian';
    case 'AE':
    case 'BH':
    case 'KW':
    case 'OM':
    case 'QA':
    case 'SA':
      return 'gulf';
    case 'JO':
    case 'LB':
    case 'PS':
    case 'SY':
      return 'levantine';
    case 'DZ':
    case 'LY':
    case 'MA':
    case 'TN':
      return 'maghrebi';
    default:
      return 'msa';
  }
}

function buildLocalIntentHints(countryCode: string | null, city: string | null): string[] {
  const locationHint = city ? `Include location-aware phrasing for ${city}.` : countryCode ? `Weight search behavior for ${countryCode}.` : 'Weight geographic modifiers when the query implies local discovery.';

  return [
    locationHint,
    'Prefer search phrasing real users in the market would type, not literal translation from English.',
    'Preserve Arabic script for Arabic audiences and only transliterate when the local market genuinely uses it.',
    'Reflect local commercial intent, seasonal buying moments, and region-specific trust signals.',
  ];
}

export function resolveMarketContext(input: MarketContextInput = {}): ResolvedMarketContext {
  const countryCode = normalizeCountryCode(input.countryCode);
  const promptSignals = [input.prompt, input.audience, ...(input.keywords ?? [])].filter((value): value is string => Boolean(value));
  const hasArabicSignal = promptSignals.some((value) => containsArabicScript(value));
  const language = (input.language ?? (hasArabicSignal ? 'ar' : 'en')).toLowerCase();
  const isArabic = language.startsWith('ar') || hasArabicSignal;
  const direction = input.direction ?? (isArabic ? 'rtl' : 'ltr');
  const isMena = countryCode ? MENA_COUNTRIES.has(countryCode) : isArabic;

  return {
    language,
    dialect: inferDialect(countryCode, input.dialect),
    countryCode,
    region: input.region?.trim() || null,
    city: input.city?.trim() || null,
    direction,
    isArabic,
    isMena,
    localIntentHints: buildLocalIntentHints(countryCode, input.city?.trim() || null),
  };
}

function getDialectInstruction(dialect: ArabicDialect): string {
  switch (dialect) {
    case 'egyptian':
      return 'Use Egyptian Arabic when the audience expects colloquial copy, but keep structural SEO metadata understandable in Modern Standard Arabic.';
    case 'gulf':
      return 'Prefer Gulf Arabic phrasing for commercial hooks while keeping headings and metadata clear across GCC audiences.';
    case 'levantine':
      return 'Prefer Levantine phrasing for consumer-facing hooks, while keeping structured SEO outputs stable in Modern Standard Arabic.';
    case 'maghrebi':
      return 'Use Maghrebi-aware phrasing only where local search behavior supports it, and avoid over-local slang in metadata.';
    case 'msa':
    case 'auto':
    default:
      return 'Use Modern Standard Arabic unless the market clearly benefits from a localized dialect.';
  }
}

export function buildSeoLanguageInstruction(context: ResolvedMarketContext): string {
  if (!context.isArabic) {
    return `You are an enterprise SEO strategist focused on ${context.countryCode ?? 'global'} market relevance. Prioritize local search intent, SERP behavior, and commercial nuance instead of literal translation.`;
  }

  return [
    'You are an enterprise SEO strategist for Arabic-speaking MENA markets.',
    getDialectInstruction(context.dialect),
    'Distinguish between Modern Standard Arabic for durable SEO structure and dialectal Arabic for high-conversion phrasing.',
    'Do not translate English intent word-for-word. Infer the query shape a local user would naturally type.',
    'Return Arabic text in readable RTL-friendly formatting and never transliterate Arabic into Latin characters unless the market commonly searches that way.',
    ...context.localIntentHints,
  ].join(' ');
}

export function buildCreativeLanguageInstruction(context: ResolvedMarketContext, format: 'image' | 'landing_page' | 'ad_copy' | 'video_script' | 'email_template'): string {
  const base = context.isArabic
    ? [
        'You are generating creative assets for Arabic-speaking MENA audiences.',
        getDialectInstruction(context.dialect),
        'All Arabic-facing copy must respect RTL reading order, punctuation flow, and culturally natural phrasing.',
        'Do not mirror Latin-layout assumptions into Arabic compositions.',
      ]
    : ['You are generating conversion-focused creative assets tailored to local market intent.'];

  if (format === 'image') {
    base.push('For image overlays, keep Arabic copy short, legible, and centered for RTL composition. Specify Arabic-first font choices such as Tajawal, IBM Plex Sans Arabic, or Noto Kufi Arabic.');
  }

  if (format === 'landing_page') {
    base.push('For landing pages, output semantic HTML that sets dir="rtl" and lang="ar" when Arabic is used, and structure sections in RTL reading order.');
  }

  return [...base, ...context.localIntentHints].join(' ');
}

export function enforceRtlHtmlDocument(html: string, preferredFontFamily = 'Tajawal, "IBM Plex Sans Arabic", "Noto Kufi Arabic", sans-serif'): string {
  const baseMarkup = html.trim() || '<main><section><h1></h1><p></p><a href="#"></a></section></main>';
  const withLang = baseMarkup.includes('<html')
    ? baseMarkup.replace(/<html([^>]*)>/i, (_match, attrs) => {
        const normalizedAttrs = attrs.includes('dir=') ? attrs : `${attrs} dir="rtl"`;
        return normalizedAttrs.includes('lang=') ? `<html${normalizedAttrs}>` : `<html${normalizedAttrs} lang="ar">`;
      })
    : `<!DOCTYPE html><html lang="ar" dir="rtl"><head></head><body>${baseMarkup}</body></html>`;

  const styleBlock = `<style>html,body{direction:rtl;text-align:right;font-family:${preferredFontFamily};}body{margin:0;background:#0f172a;color:#e5e7eb;}main,section,header,footer,article,aside,nav{direction:rtl;text-align:right;}a,button{font-family:${preferredFontFamily};}</style>`;

  if (withLang.includes('</head>')) {
    return withLang.replace('</head>', `${styleBlock}</head>`);
  }

  return withLang.replace(/<body([^>]*)>/i, `<head>${styleBlock}</head><body$1>`);
}
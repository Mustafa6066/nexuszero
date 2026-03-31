// ---------------------------------------------------------------------------
// Prompt Injection Detection & Sanitization
//
// Detects common prompt injection patterns in user-supplied text before it's
// interpolated into LLM system/user prompts. All functions are pure — no I/O.
// ---------------------------------------------------------------------------

/** Result of a prompt injection scan */
export interface InjectionScanResult {
  /** Whether injection was detected */
  detected: boolean;
  /** Risk level */
  risk: 'none' | 'low' | 'medium' | 'high';
  /** Which patterns triggered */
  triggers: string[];
  /** Sanitized version of the input (safe to use) */
  sanitized: string;
}

// Patterns that attempt to override system prompts or inject new instructions
const HIGH_RISK_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  { name: 'system_override', pattern: /\bignore\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions?|prompts?|rules?|context)\b/i },
  { name: 'system_override_alt', pattern: /\bdisregard\s+(all\s+)?(previous|prior|above)\s+(instructions?|prompts?|rules?)\b/i },
  { name: 'new_instructions', pattern: /\bnew\s+instructions?\s*[:]/i },
  { name: 'role_hijack', pattern: /\byou\s+are\s+now\s+(a|an|the)\b/i },
  { name: 'role_hijack_alt', pattern: /\bact\s+as\s+(a|an|if\s+you\s+are)\b/i },
  { name: 'system_prompt_leak', pattern: /\b(reveal|show|display|print|output|repeat)\s+(your|the|system)\s+(system\s+)?(prompt|instructions?|rules?)\b/i },
  { name: 'prompt_boundary', pattern: /---\s*(system|end\s+of\s+system|begin\s+user|new\s+context)\s*---/i },
  { name: 'jailbreak_dan', pattern: /\b(DAN|do\s+anything\s+now|jailbreak)\b/i },
  { name: 'xml_injection', pattern: /<\/?(?:system|instructions?|prompt|context|role|rules?)\s*>/i },
];

// Patterns that are suspicious but not definitively malicious
const MEDIUM_RISK_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  { name: 'forget_instruction', pattern: /\bforget\s+(everything|all|what)\s+(you|i)\b/i },
  { name: 'pretend_prompt', pattern: /\bpretend\s+(that|the|this|you)\b/i },
  { name: 'override_attempt', pattern: /\boverride\s+(the|your|system|all)\b/i },
  { name: 'base64_payload', pattern: /[A-Za-z0-9+/]{60,}={0,2}/ },
  { name: 'hex_escape', pattern: /\\x[0-9a-f]{2}(?:\\x[0-9a-f]{2}){4,}/i },
  { name: 'unicode_escape', pattern: /\\u[0-9a-f]{4}(?:\\u[0-9a-f]{4}){3,}/i },
  { name: 'markdown_code_system', pattern: /```(?:system|prompt|instructions)\b/i },
];

// Low-risk patterns — noteworthy but often legitimate
const LOW_RISK_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  { name: 'response_format', pattern: /\brespond\s+(only\s+)?(in|with)\s+(json|xml|html|code)\b/i },
  { name: 'output_format', pattern: /\boutput\s+(only|just)\b/i },
];

/**
 * Scan text for prompt injection patterns.
 * Returns a result with risk level, triggers, and a sanitized version.
 */
export function scanForInjection(input: string): InjectionScanResult {
  const triggers: string[] = [];
  let risk: InjectionScanResult['risk'] = 'none';

  for (const { name, pattern } of HIGH_RISK_PATTERNS) {
    if (pattern.test(input)) {
      triggers.push(name);
      risk = 'high';
    }
  }

  if (risk !== 'high') {
    for (const { name, pattern } of MEDIUM_RISK_PATTERNS) {
      if (pattern.test(input)) {
        triggers.push(name);
        if (risk === 'none') risk = 'medium';
      }
    }
  }

  if (risk === 'none') {
    for (const { name, pattern } of LOW_RISK_PATTERNS) {
      if (pattern.test(input)) {
        triggers.push(name);
        risk = 'low';
      }
    }
  }

  return {
    detected: risk === 'high' || risk === 'medium',
    risk,
    triggers,
    sanitized: sanitizePromptInput(input),
  };
}

/**
 * Sanitize user input before interpolating into LLM prompts.
 * - Strips prompt boundary markers
 * - Neutralizes role hijacking phrases
 * - Escapes XML-like tags that could confuse structured prompts
 * - Truncates extremely long inputs
 */
export function sanitizePromptInput(input: string, maxLength = 10_000): string {
  let sanitized = input;

  // Remove prompt boundary markers
  sanitized = sanitized.replace(/---\s*(system|end\s+of\s+system|begin\s+user|new\s+context)\s*---/gi, '');

  // Escape XML-like instruction tags (but keep normal HTML like <b>, <i>)
  sanitized = sanitized.replace(/<\/?(?:system|instructions?|prompt|context|role|rules?)\s*>/gi, (match) => {
    return match.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  });

  // Truncate
  if (sanitized.length > maxLength) {
    sanitized = sanitized.slice(0, maxLength);
  }

  return sanitized.trim();
}

/**
 * Wrap user-supplied data with delimiters that clearly separate it from instructions.
 * This is the recommended way to interpolate user data into prompts.
 */
export function wrapUserData(label: string, data: string): string {
  const delimiter = '═'.repeat(40);
  const sanitized = sanitizePromptInput(data);
  return `\n${delimiter}\n[USER DATA: ${label}]\n${sanitized}\n[END USER DATA]\n${delimiter}\n`;
}

/**
 * Assert that input is safe for LLM prompt interpolation.
 * Throws if high-risk injection is detected.
 */
export function assertSafeInput(input: string, fieldName = 'input'): string {
  const result = scanForInjection(input);
  if (result.risk === 'high') {
    throw new Error(`Potential prompt injection detected in ${fieldName}: ${result.triggers.join(', ')}`);
  }
  return result.sanitized;
}

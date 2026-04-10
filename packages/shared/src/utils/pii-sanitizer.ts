/**
 * PII Sanitizer
 *
 * Regex-based PII pattern detection and redaction for content flowing
 * through NexusZero agents. Supports scan (detect) and redact modes.
 *
 * Ported from: ai-marketing-skills security/sanitizer.py
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PiiMatch {
  type: PiiType;
  value: string;
  redacted: string;
  startIndex: number;
  endIndex: number;
}

export interface PiiScanResult {
  /** Whether any PII was detected */
  hasPii: boolean;
  /** Total number of PII instances found */
  totalMatches: number;
  /** Grouped matches by type */
  matches: PiiMatch[];
  /** Types of PII found */
  typesFound: PiiType[];
}

export interface PiiRedactResult extends PiiScanResult {
  /** Content with PII replaced */
  redactedContent: string;
}

export type PiiType =
  | 'email'
  | 'phone'
  | 'ssn'
  | 'credit_card'
  | 'api_key'
  | 'ip_address'
  | 'date_of_birth'
  | 'custom_blocklist';

export interface PiiSanitizerConfig {
  /** PII types to detect (default: all) */
  types?: PiiType[];
  /** Custom blocklist patterns (company names, person names, etc.) */
  blocklist?: string[];
  /** Replacement format (default: '[REDACTED:{type}]') */
  redactionFormat?: string;
}

// ---------------------------------------------------------------------------
// Pattern definitions
// ---------------------------------------------------------------------------

interface PiiPattern {
  type: PiiType;
  regex: RegExp;
  /** Validate match to reduce false positives */
  validate?: (match: string) => boolean;
}

const PII_PATTERNS: PiiPattern[] = [
  {
    type: 'email',
    regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
  },
  {
    type: 'phone',
    regex: /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
    validate: (match: string) => {
      // Filter out numbers that are too short or lack separators
      const digits = match.replace(/\D/g, '');
      return digits.length >= 10 && digits.length <= 15;
    },
  },
  {
    type: 'ssn',
    regex: /\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/g,
    validate: (match: string) => {
      const digits = match.replace(/\D/g, '');
      // SSNs don't start with 000, 666, or 9xx
      if (digits.length !== 9) return false;
      const area = parseInt(digits.substring(0, 3), 10);
      return area !== 0 && area !== 666 && area < 900;
    },
  },
  {
    type: 'credit_card',
    regex: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g,
    validate: (match: string) => {
      // Basic Luhn check
      const digits = match.replace(/\D/g, '');
      if (digits.length < 13 || digits.length > 19) return false;
      let sum = 0;
      let isEven = false;
      for (let i = digits.length - 1; i >= 0; i--) {
        let digit = parseInt(digits[i]!, 10);
        if (isEven) {
          digit *= 2;
          if (digit > 9) digit -= 9;
        }
        sum += digit;
        isEven = !isEven;
      }
      return sum % 10 === 0;
    },
  },
  {
    type: 'api_key',
    regex: /\b(?:sk|pk|api|key|token|secret|password|bearer)[-_]?[a-zA-Z0-9]{20,}\b/gi,
  },
  {
    type: 'api_key',
    regex: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}\b/g, // GitHub tokens
  },
  {
    type: 'api_key',
    regex: /\bAIza[0-9A-Za-z\-_]{35}\b/g, // Google API keys
  },
  {
    type: 'ip_address',
    regex: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
    validate: (match: string) => {
      const octets = match.split('.').map(Number);
      // Exclude common non-PII IPs (0.0.0.0, 127.0.0.1, etc)
      if (octets[0] === 127 || octets[0] === 0) return false;
      return octets.every(o => o >= 0 && o <= 255);
    },
  },
  {
    type: 'date_of_birth',
    regex: /\b(?:0[1-9]|1[012])[-/](?:0[1-9]|[12][0-9]|3[01])[-/](?:19|20)\d{2}\b/g,
  },
];

// ---------------------------------------------------------------------------
// Core functions
// ---------------------------------------------------------------------------

function buildRedactionLabel(type: PiiType, format: string): string {
  return format.replace('{type}', type.toUpperCase());
}

function findMatches(
  content: string,
  config: PiiSanitizerConfig = {},
): PiiMatch[] {
  const enabledTypes = config.types ?? (['email', 'phone', 'ssn', 'credit_card', 'api_key', 'ip_address', 'date_of_birth'] as PiiType[]);
  const redactionFormat = config.redactionFormat ?? '[REDACTED:{type}]';
  const matches: PiiMatch[] = [];

  // Regex-based patterns
  for (const pattern of PII_PATTERNS) {
    if (!enabledTypes.includes(pattern.type)) continue;

    pattern.regex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.regex.exec(content)) !== null) {
      const value = match[0];
      if (pattern.validate && !pattern.validate(value)) continue;

      matches.push({
        type: pattern.type,
        value,
        redacted: buildRedactionLabel(pattern.type, redactionFormat),
        startIndex: match.index,
        endIndex: match.index + value.length,
      });

      if (match.index === pattern.regex.lastIndex) {
        pattern.regex.lastIndex++;
      }
    }
  }

  // Custom blocklist
  if (config.blocklist && config.blocklist.length > 0 && enabledTypes.includes('custom_blocklist')) {
    for (const term of config.blocklist) {
      if (term.length < 2) continue; // Skip trivially short terms
      // Escape regex special chars in blocklist terms
      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`\\b${escaped}\\b`, 'gi');
      let match: RegExpExecArray | null;
      while ((match = regex.exec(content)) !== null) {
        matches.push({
          type: 'custom_blocklist',
          value: match[0],
          redacted: buildRedactionLabel('custom_blocklist', redactionFormat),
          startIndex: match.index,
          endIndex: match.index + match[0].length,
        });
      }
    }
  }

  // Sort by position (descending for safe replacement)
  return matches.sort((a, b) => a.startIndex - b.startIndex);
}

/**
 * Scan content for PII without modifying it.
 */
export function scanPii(content: string, config?: PiiSanitizerConfig): PiiScanResult {
  const matches = findMatches(content, config);
  const typesFound = [...new Set(matches.map(m => m.type))];

  return {
    hasPii: matches.length > 0,
    totalMatches: matches.length,
    matches,
    typesFound,
  };
}

/**
 * Scan and redact PII from content.
 */
export function redactPii(content: string, config?: PiiSanitizerConfig): PiiRedactResult {
  const matches = findMatches(content, config);
  const typesFound = [...new Set(matches.map(m => m.type))];

  // Apply redactions from end to start to preserve indices
  let redactedContent = content;
  const sortedDesc = [...matches].sort((a, b) => b.startIndex - a.startIndex);
  for (const match of sortedDesc) {
    redactedContent =
      redactedContent.substring(0, match.startIndex) +
      match.redacted +
      redactedContent.substring(match.endIndex);
  }

  return {
    hasPii: matches.length > 0,
    totalMatches: matches.length,
    matches,
    typesFound,
    redactedContent,
  };
}

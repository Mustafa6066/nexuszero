const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Validate email address format */
export function isValidEmail(email: string): boolean {
  return EMAIL_REGEX.test(email) && email.length <= 254;
}

/** Validate URL-safe slug */
export function isValidSlug(slug: string): boolean {
  return SLUG_REGEX.test(slug) && slug.length >= 2 && slug.length <= 63;
}

/** Validate UUID format */
export function isValidUuid(id: string): boolean {
  return UUID_REGEX.test(id);
}

/** Validate URL format */
export function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

/**
 * Validate webhook URL - must be HTTPS and not target private/reserved networks.
 * Blocks SSRF by rejecting private IPs, loopback, link-local, and metadata endpoints.
 */
export function isValidWebhookUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return false;

    const hostname = parsed.hostname.toLowerCase();

    // Block obvious private/reserved hostnames
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') return false;
    if (hostname === '0.0.0.0' || hostname.endsWith('.local') || hostname.endsWith('.internal')) return false;

    // Block cloud metadata endpoints
    if (hostname === '169.254.169.254' || hostname === 'metadata.google.internal') return false;

    // Block private IP ranges
    const parts = hostname.split('.');
    if (parts.length === 4 && parts.every(p => /^\d+$/.test(p))) {
      const first = parseInt(parts[0]!, 10);
      const second = parseInt(parts[1]!, 10);
      if (first === 10) return false;                      // 10.0.0.0/8
      if (first === 172 && second >= 16 && second <= 31) return false; // 172.16.0.0/12
      if (first === 192 && second === 168) return false;   // 192.168.0.0/16
      if (first === 169 && second === 254) return false;   // 169.254.0.0/16 link-local
      if (first === 0) return false;                       // 0.0.0.0/8
    }

    return true;
  } catch {
    return false;
  }
}

/** Strip HTML tags and limit length to prevent XSS/injection */
export function sanitizeString(input: string, maxLength = 1000): string {
  return input
    .replace(/<[^>]*>/g, '')
    .replace(/[^\S ]+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

/** Validate and clamp pagination parameters */
export function validatePagination(page?: number, limit?: number): { page: number; limit: number; offset: number } {
  const validPage = Math.max(1, Math.floor(page ?? 1));
  const validLimit = Math.min(100, Math.max(1, Math.floor(limit ?? 20)));
  return {
    page: validPage,
    limit: validLimit,
    offset: (validPage - 1) * validLimit,
  };
}

/** Validate date range. Returns null if invalid, parsed dates if valid */
export function validateDateRange(startDate: string, endDate: string): { start: Date; end: Date } | null {
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;
  if (start > end) return null;
  // Max range: 1 year
  const oneYear = 365 * 24 * 60 * 60 * 1000;
  if (end.getTime() - start.getTime() > oneYear) return null;
  return { start, end };
}

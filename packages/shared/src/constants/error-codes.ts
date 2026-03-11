/** Structured error codes with HTTP status and default message */
export const ERROR_CODES = {
  // Auth errors (1xxx)
  AUTH_REQUIRED: { code: 1001, status: 401, message: 'Authentication required' },
  AUTH_INVALID_TOKEN: { code: 1002, status: 401, message: 'Invalid or expired token' },
  AUTH_INVALID_API_KEY: { code: 1003, status: 401, message: 'Invalid API key' },
  AUTH_INSUFFICIENT_PERMISSIONS: { code: 1004, status: 403, message: 'Insufficient permissions' },
  AUTH_ACCOUNT_SUSPENDED: { code: 1005, status: 403, message: 'Account is suspended' },

  // Tenant errors (2xxx)
  TENANT_NOT_FOUND: { code: 2001, status: 404, message: 'Tenant not found' },
  TENANT_SLUG_TAKEN: { code: 2002, status: 409, message: 'Tenant slug already taken' },
  TENANT_LIMIT_REACHED: { code: 2003, status: 403, message: 'Tenant resource limit reached' },
  TENANT_PROVISIONING_FAILED: { code: 2004, status: 500, message: 'Tenant provisioning failed' },

  // Agent errors (3xxx)
  AGENT_NOT_FOUND: { code: 3001, status: 404, message: 'Agent not found' },
  AGENT_LIMIT_EXCEEDED: { code: 3002, status: 403, message: 'Agent limit for your plan exceeded' },
  AGENT_TYPE_NOT_ALLOWED: { code: 3003, status: 403, message: 'Agent type not allowed on your plan' },
  AGENT_ALREADY_EXISTS: { code: 3004, status: 409, message: 'Agent of this type already exists' },
  AGENT_OFFLINE: { code: 3005, status: 503, message: 'Agent is currently offline' },

  // Campaign errors (4xxx)
  CAMPAIGN_NOT_FOUND: { code: 4001, status: 404, message: 'Campaign not found' },
  CAMPAIGN_INVALID_STATUS: { code: 4002, status: 400, message: 'Invalid campaign status transition' },
  CAMPAIGN_BUDGET_EXCEEDED: { code: 4003, status: 400, message: 'Campaign budget exceeds limit' },

  // Creative errors (5xxx)
  CREATIVE_NOT_FOUND: { code: 5001, status: 404, message: 'Creative not found' },
  CREATIVE_GENERATION_FAILED: { code: 5002, status: 500, message: 'Creative generation failed' },
  CREATIVE_PROVIDER_UNAVAILABLE: { code: 5003, status: 503, message: 'Creative provider unavailable' },
  CREATIVE_BRAND_VIOLATION: { code: 5004, status: 400, message: 'Creative violates brand guidelines' },
  CREATIVE_TEST_NOT_FOUND: { code: 5005, status: 404, message: 'Creative test not found' },

  // AEO errors (5.5xxx)
  AEO_QUERY_LIMIT_REACHED: { code: 5501, status: 429, message: 'AEO query limit reached' },
  AEO_PLATFORM_UNAVAILABLE: { code: 5502, status: 503, message: 'AI platform unavailable for checking' },

  // Analytics errors (6xxx)
  ANALYTICS_QUERY_INVALID: { code: 6001, status: 400, message: 'Invalid analytics query' },
  ANALYTICS_DATA_UNAVAILABLE: { code: 6002, status: 503, message: 'Analytics data temporarily unavailable' },

  // Webhook errors (7xxx)
  WEBHOOK_NOT_FOUND: { code: 7001, status: 404, message: 'Webhook endpoint not found' },
  WEBHOOK_LIMIT_EXCEEDED: { code: 7002, status: 403, message: 'Webhook limit for your plan exceeded' },
  WEBHOOK_DELIVERY_FAILED: { code: 7003, status: 500, message: 'Webhook delivery failed' },
  WEBHOOK_INVALID_URL: { code: 7004, status: 400, message: 'Invalid webhook URL' },

  // Rate limiting (8xxx)
  RATE_LIMIT_EXCEEDED: { code: 8001, status: 429, message: 'Rate limit exceeded' },

  // Validation (9xxx)
  VALIDATION_ERROR: { code: 9001, status: 400, message: 'Validation error' },
  INVALID_INPUT: { code: 9002, status: 400, message: 'Invalid input' },

  // System errors (10xxx)
  INTERNAL_ERROR: { code: 10001, status: 500, message: 'Internal server error' },
  SERVICE_UNAVAILABLE: { code: 10002, status: 503, message: 'Service temporarily unavailable' },
  DATABASE_ERROR: { code: 10003, status: 500, message: 'Database error' },
  QUEUE_ERROR: { code: 10004, status: 500, message: 'Queue processing error' },
  LLM_ERROR: { code: 10005, status: 502, message: 'LLM provider error' },
  STORAGE_ERROR: { code: 10006, status: 500, message: 'Storage operation failed' },
} as const;

export type ErrorCode = keyof typeof ERROR_CODES;

/** API error response shape */
export interface ApiErrorResponse {
  error: {
    code: number;
    message: string;
    details?: unknown;
    requestId?: string;
  };
}

/** Create a typed error from an error code */
export class AppError extends Error {
  public readonly code: number;
  public readonly status: number;
  public readonly details?: unknown;

  constructor(errorCode: ErrorCode, details?: unknown, overrideMessage?: string) {
    const def = ERROR_CODES[errorCode];
    super(overrideMessage ?? def.message);
    this.code = def.code;
    this.status = def.status;
    this.details = details;
    this.name = 'AppError';
  }

  toJSON(): ApiErrorResponse {
    return {
      error: {
        code: this.code,
        message: this.message,
        details: this.details,
      },
    };
  }
}

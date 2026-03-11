# NexusZero API Reference

Base URL: `https://{gateway-host}/api/v1`

All protected endpoints require either:
- `Authorization: Bearer {jwt_token}` header
- `X-API-Key: nzk_{api_key}` header

Responses follow the envelope format:
```json
{ "data": ... }
```

Errors follow:
```json
{ "error": { "code": "ERROR_CODE", "message": "Human-readable message" } }
```

---

## Authentication

### POST /auth/login
Login and receive a JWT token.

**Body:**
```json
{
  "email": "user@example.com",
  "password": "secretpassword"
}
```

**Response (200):**
```json
{
  "data": {
    "token": "eyJhbGci...",
    "user": { "id": "uuid", "email": "user@example.com", "role": "admin" },
    "tenant": { "id": "uuid", "name": "Acme Corp", "plan": "growth" }
  }
}
```

### POST /auth/register
Register a new tenant and owner account.

**Body:**
```json
{
  "name": "Acme Corp",
  "slug": "acme-corp",
  "plan": "growth",
  "ownerEmail": "owner@acme.com",
  "ownerName": "Jane Doe",
  "ownerPassword": "min8characters"
}
```

---

## Tenants

### GET /tenants/:id
Get tenant details.

### PATCH /tenants/:id
Update tenant settings, name, or plan.

### POST /tenants/:id/api-keys
Create a new API key.

**Body:**
```json
{ "name": "CI/CD Key", "expiresInDays": 90 }
```

**Response (201):**
```json
{
  "data": {
    "id": "uuid",
    "name": "CI/CD Key",
    "key": "nzk_abc123...",
    "expiresAt": "2024-10-01T00:00:00Z"
  }
}
```

### GET /tenants/:id/api-keys
List all API keys (hashes only, raw key is never stored).

### DELETE /tenants/:id/api-keys/:keyId
Revoke an API key.

---

## Campaigns

### GET /campaigns
List campaigns. Query params: `status`, `type`, `page`, `limit`.

### POST /campaigns
Create a new campaign.

**Body:**
```json
{
  "name": "Summer Sale 2024",
  "type": "ppc",
  "platform": "google_ads",
  "budget": {
    "dailyBudget": 100,
    "currency": "USD",
    "bidStrategy": "target_cpa",
    "targetCpa": 15.00
  },
  "schedule": {
    "startDate": "2024-07-01",
    "endDate": "2024-08-31"
  },
  "targeting": {
    "locations": ["US", "CA"],
    "interests": ["technology", "saas"]
  }
}
```

### GET /campaigns/:id
Get campaign details including performance metrics.

### PATCH /campaigns/:id
Update campaign (name, status, budget, targeting).

### DELETE /campaigns/:id
Archive a campaign.

---

## Agents

### GET /agents
List all agents with current status. Query: `type`, `status`.

### GET /agents/:type/status
Get detailed agent status including heartbeat, queue depth, tasks processed.

### POST /agents/:type/signal
Send a control signal to an agent.

**Body:**
```json
{
  "action": "pause_agent",
  "reason": "Budget review required",
  "parameters": {}
}
```

### GET /agents/:type/tasks
List recent tasks for an agent. Query: `status`, `page`, `limit`.

---

## Creatives

### GET /creatives
List creatives. Query: `type`, `status`, `campaignId`, `search`, `sortBy`, `page`, `limit`.

### POST /creatives/generate
Generate new creative assets.

**Body:**
```json
{
  "type": "ad_copy",
  "prompt": "Generate compelling ad copy for our AI marketing platform",
  "brandGuidelines": {
    "primaryColor": "#6C3AED",
    "secondaryColor": "#1E293B",
    "fontFamily": "Inter",
    "tone": "professional yet approachable"
  },
  "targetAudience": "B2B SaaS marketers",
  "platform": "google_ads",
  "variants": 5
}
```

### GET /creatives/:id
Get creative details including brand score and predicted CTR.

### PATCH /creatives/:id
Update creative status or tags.

### POST /creatives/test
Start an A/B test between creative variants.

**Body:**
```json
{
  "campaignId": "uuid",
  "creativeId": "uuid",
  "variantIds": ["variant-a", "variant-b"],
  "confidenceLevel": 0.95
}
```

---

## Analytics

### GET /analytics/overview
Dashboard overview metrics. Query: `period` (7d, 30d, 90d).

### GET /analytics/revenue
Revenue time series. Query: `startDate`, `endDate`, `granularity` (day, week, month).

### GET /analytics/funnel
Funnel analysis data.

### GET /analytics/forecast
ML-powered forecast for key metrics.

### GET /analytics/anomalies
Recent anomaly detections.

---

## AEO (Answer Engine Optimization)

### GET /aeo/citations
List AI citations. Query: `platform`, `page`, `limit`.

### GET /aeo/entities
List managed entity profiles.

### GET /aeo/visibility
Visibility scores across AI platforms (ChatGPT, Gemini, Perplexity, Bing Copilot).

### POST /aeo/scan
Trigger a citation scan.

**Body:**
```json
{ "keywords": ["nexuszero", "ai marketing platform"], "platforms": ["chatgpt", "perplexity"] }
```

---

## Webhooks

### GET /webhooks
List configured webhook endpoints.

### POST /webhooks
Create a new webhook endpoint.

**Body:**
```json
{
  "url": "https://example.com/webhook",
  "events": ["campaign.created", "agent.task_completed", "analytics.anomaly_detected"],
  "active": true
}
```

### PATCH /webhooks/:id
Update webhook URL, events, or active status.

### DELETE /webhooks/:id
Delete a webhook endpoint.

### GET /webhooks/:id/deliveries
List recent deliveries with status (success/failure) and status codes.

---

## GraphQL

Endpoint: `POST /graphql`

The GraphQL API provides the same data as REST with the benefit of query composition. Built with GraphQL Yoga + Pothos.

Example query:
```graphql
query DashboardOverview {
  campaigns(status: ACTIVE, first: 5) {
    edges {
      node {
        id
        name
        budget { dailyBudget currency }
        performance { roas ctr impressions }
      }
    }
    totalCount
  }
  agents {
    type
    status
    lastHeartbeat
    tasksProcessed
  }
}
```

---

## Rate Limits

| Plan        | Requests / minute |
|-------------|-------------------|
| Launchpad   | 100               |
| Growth      | 500               |
| Enterprise  | 2,000             |

Rate limit headers are included in every response:
- `X-RateLimit-Limit`: Max requests per window
- `X-RateLimit-Remaining`: Remaining requests
- `X-RateLimit-Reset`: Unix timestamp when window resets

---

## Webhook Payload Format

All webhook deliveries include:
- `X-NexusZero-Signature`: HMAC-SHA256 signature of the body
- `X-NexusZero-Event`: Event type (e.g., `campaign.created`)
- `X-NexusZero-Delivery-Id`: Unique delivery ID

**Payload:**
```json
{
  "id": "delivery-uuid",
  "event": "campaign.created",
  "timestamp": "2024-07-01T12:00:00Z",
  "data": { ... }
}
```

Verify signature:
```js
const crypto = require('crypto');
const expected = crypto.createHmac('sha256', webhookSecret)
  .update(rawBody)
  .digest('hex');
const valid = crypto.timingSafeEqual(
  Buffer.from(signature),
  Buffer.from(expected)
);
```

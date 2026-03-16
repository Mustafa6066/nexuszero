/**
 * Notification Dispatcher — Pushes alerts, digests, and approval requests
 * to Slack/Teams instead of requiring dashboard login.
 *
 * Implements the "Reverse ETL / Zero-Dashboard" paradigm: meet users where they work.
 *
 * NOTE: This module is in @nexuszero/shared and cannot import @nexuszero/db.
 * Callers must look up tenant notification prefs from the DB and pass them in,
 * or use the tenantId overload which reads from the in-process notification registry.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export type NotificationType =
  | 'digest'
  | 'anomaly_alert'
  | 'approval_request'
  | 'integration_health'
  | 'token_expired'
  | 'creative_ready'
  | 'campaign_milestone';

export interface Notification {
  type: NotificationType;
  title: string;
  body: string;
  severity: 'info' | 'warning' | 'critical';
  data?: Record<string, unknown>;
  actionUrl?: string;
  actionLabel?: string;
}

export interface NotificationChannels {
  slackWebhookUrl?: string | null;
  teamsWebhookUrl?: string | null;
}

// ── Registry (set once per process by the service that has DB access) ────────

type TenantPrefsResolver = (tenantId: string) => Promise<NotificationChannels>;

let _prefsResolver: TenantPrefsResolver | null = null;

/**
 * Register a function that resolves tenant notification prefs from the DB.
 * Call this once at service startup (e.g., in the orchestrator or compat-agent).
 */
export function registerNotificationPrefsResolver(resolver: TenantPrefsResolver): void {
  _prefsResolver = resolver;
}

// ── Dispatcher ───────────────────────────────────────────────────────────────

/**
 * Dispatch a notification to all configured channels for a tenant.
 * Uses the registered prefs resolver to look up webhook URLs.
 */
export async function dispatchNotification(
  tenantId: string,
  notification: Notification,
): Promise<{ slack: boolean; teams: boolean }> {
  let channels: NotificationChannels = {};

  if (_prefsResolver) {
    try {
      channels = await _prefsResolver(tenantId);
    } catch {
      // Prefs lookup failed — fall through with no channels
    }
  }

  return dispatchToChannels(tenantId, notification, channels);
}

/**
 * Dispatch a notification with explicit channel config (no DB lookup).
 */
export async function dispatchToChannels(
  tenantId: string,
  notification: Notification,
  channels: NotificationChannels,
): Promise<{ slack: boolean; teams: boolean }> {
  const results = { slack: false, teams: false };

  if (channels.slackWebhookUrl) {
    results.slack = await sendSlackNotification(channels.slackWebhookUrl, notification);
  }

  if (channels.teamsWebhookUrl) {
    results.teams = await sendTeamsNotification(channels.teamsWebhookUrl, notification);
  }

  if (!channels.slackWebhookUrl && !channels.teamsWebhookUrl) {
    console.log(
      JSON.stringify({
        level: 'debug',
        msg: 'No notification channels configured',
        tenantId,
        notificationType: notification.type,
      }),
    );
  }

  return results;
}

// ── Slack ─────────────────────────────────────────────────────────────────────

async function sendSlackNotification(webhookUrl: string, notification: Notification): Promise<boolean> {
  const severityEmoji: Record<string, string> = {
    info: ':large_blue_circle:',
    warning: ':warning:',
    critical: ':red_circle:',
  };

  const blocks: Record<string, unknown>[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `${notification.title}`,
        emoji: true,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `${severityEmoji[notification.severity] ?? ''} ${notification.body}`,
      },
    },
  ];

  if (notification.actionUrl) {
    blocks.push({
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: notification.actionLabel ?? 'View in NexusZero',
          },
          url: notification.actionUrl,
          style: notification.severity === 'critical' ? 'danger' : 'primary',
        },
      ],
    });
  }

  blocks.push({
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: `*NexusZero* | ${new Date().toISOString()}`,
      },
    ],
  });

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blocks }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      console.warn(`Slack notification failed: ${response.status} ${response.statusText}`);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('Slack notification error:', (err as Error).message);
    return false;
  }
}

// ── Microsoft Teams ──────────────────────────────────────────────────────────

async function sendTeamsNotification(webhookUrl: string, notification: Notification): Promise<boolean> {
  const card = {
    type: 'message',
    attachments: [
      {
        contentType: 'application/vnd.microsoft.card.adaptive',
        content: {
          $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
          type: 'AdaptiveCard',
          version: '1.4',
          body: [
            {
              type: 'TextBlock',
              text: notification.title,
              weight: 'Bolder',
              size: 'Large',
              color: notification.severity === 'critical' ? 'Attention' : notification.severity === 'warning' ? 'Warning' : 'Default',
            },
            {
              type: 'TextBlock',
              text: notification.body,
              wrap: true,
            },
          ],
          actions: notification.actionUrl
            ? [
                {
                  type: 'Action.OpenUrl',
                  title: notification.actionLabel ?? 'View in NexusZero',
                  url: notification.actionUrl,
                },
              ]
            : [],
        },
      },
    ],
  };

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(card),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      console.warn(`Teams notification failed: ${response.status} ${response.statusText}`);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('Teams notification error:', (err as Error).message);
    return false;
  }
}

// ── Convenience builders ─────────────────────────────────────────────────────

/** Build a token-expired notification with re-auth magic link */
export function buildTokenExpiredNotification(
  platforms: string[],
  reconnectUrl: string,
): Notification {
  return {
    type: 'token_expired',
    title: 'Integration Reconnection Required',
    body: `The following platform(s) need re-authentication: ${platforms.join(', ')}. Click below to reconnect.`,
    severity: 'warning',
    actionUrl: reconnectUrl,
    actionLabel: 'Reconnect Now',
    data: { platforms },
  };
}

/** Build an anomaly alert notification */
export function buildAnomalyNotification(
  metric: string,
  severity: 'warning' | 'critical',
  details: string,
  dashboardUrl?: string,
): Notification {
  return {
    type: 'anomaly_alert',
    title: `Anomaly Detected: ${metric}`,
    body: details,
    severity,
    actionUrl: dashboardUrl,
    actionLabel: 'Investigate',
  };
}

/** Build a daily digest notification */
export function buildDigestNotification(
  sections: { title: string; items: { text: string }[] }[],
  dashboardUrl?: string,
): Notification {
  const summary = sections.map(s => `*${s.title}*: ${s.items.length} items`).join(' | ');
  return {
    type: 'digest',
    title: 'Daily Orbit Digest',
    body: summary,
    severity: 'info',
    actionUrl: dashboardUrl,
    actionLabel: 'View Full Report',
  };
}

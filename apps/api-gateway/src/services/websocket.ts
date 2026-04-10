import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage } from 'node:http';
import type { Server } from 'node:http';
import { type JwtPayload } from 'jsonwebtoken';

// ---------------------------------------------------------------------------
// WebSocket Real-Time Layer
//
// Supports channels:
//   agent:status      — Live agent status updates
//   task:progress     — Task progress & completion events
//   alerts            — Anomaly/SLA breach alerts
//   analytics:live    — Real-time analytics updates
// ---------------------------------------------------------------------------

export interface WsMessage {
  channel: string;
  event: string;
  data: unknown;
  timestamp: string;
}

interface AuthenticatedSocket {
  ws: WebSocket;
  tenantId: string;
  userId: string;
  subscriptions: Set<string>;
  lastPing: number;
}

const HEARTBEAT_INTERVAL = 30_000;
const CLIENT_TIMEOUT = 45_000;

let wss: WebSocketServer | null = null;
const clients = new Map<WebSocket, AuthenticatedSocket>();
const tenantClients = new Map<string, Set<WebSocket>>();

/**
 * Attach WebSocket server to the existing HTTP server.
 * Call this after the HTTP server starts.
 */
export function attachWebSocketServer(
  httpServer: Server | { on?: unknown },
  verifyToken: (token: string) => JwtPayload & { tenantId: string; userId: string },
): WebSocketServer {
  wss = new WebSocketServer({ server: httpServer as Server, path: '/ws' });

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    handleConnection(ws, req, verifyToken);
  });

  // Heartbeat: ping clients every interval, disconnect if no pong
  const heartbeat = setInterval(() => {
    const now = Date.now();
    for (const [ws, client] of clients) {
      if (now - client.lastPing > CLIENT_TIMEOUT) {
        removeClient(ws);
        ws.terminate();
        continue;
      }
      ws.ping();
    }
  }, HEARTBEAT_INTERVAL);

  wss.on('close', () => {
    clearInterval(heartbeat);
    clients.clear();
    tenantClients.clear();
  });

  return wss;
}

function handleConnection(
  ws: WebSocket,
  req: IncomingMessage,
  verifyToken: (token: string) => JwtPayload & { tenantId: string; userId: string },
): void {
  // Extract token from query string: /ws?token=xxx
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
  const token = url.searchParams.get('token');

  if (!token) {
    ws.close(4001, 'Authentication required');
    return;
  }

  let payload: JwtPayload & { tenantId: string; userId: string };
  try {
    payload = verifyToken(token);
  } catch {
    ws.close(4001, 'Invalid token');
    return;
  }

  const client: AuthenticatedSocket = {
    ws,
    tenantId: payload.tenantId,
    userId: payload.userId,
    subscriptions: new Set(),
    lastPing: Date.now(),
  };

  clients.set(ws, client);

  // Track by tenant for efficient broadcasting
  if (!tenantClients.has(payload.tenantId)) {
    tenantClients.set(payload.tenantId, new Set());
  }
  tenantClients.get(payload.tenantId)!.add(ws);

  // Handle incoming messages (subscribe/unsubscribe)
  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      handleClientMessage(client, msg);
    } catch {
      // Invalid message — ignore
    }
  });

  ws.on('pong', () => {
    client.lastPing = Date.now();
  });

  ws.on('close', () => {
    removeClient(ws);
  });

  ws.on('error', () => {
    removeClient(ws);
  });

  // Send connected confirmation
  sendToClient(ws, {
    channel: 'system',
    event: 'connected',
    data: { tenantId: payload.tenantId, userId: payload.userId },
    timestamp: new Date().toISOString(),
  });
}

function handleClientMessage(
  client: AuthenticatedSocket,
  msg: { action?: string; channel?: string },
): void {
  const ALLOWED_CHANNELS = ['agent:status', 'task:progress', 'alerts', 'analytics:live', 'sla:breaches', 'onboarding:progress', 'notification:push'];

  if (msg.action === 'subscribe' && msg.channel && ALLOWED_CHANNELS.includes(msg.channel)) {
    client.subscriptions.add(msg.channel);
    sendToClient(client.ws, {
      channel: 'system',
      event: 'subscribed',
      data: { channel: msg.channel },
      timestamp: new Date().toISOString(),
    });
  }

  if (msg.action === 'unsubscribe' && msg.channel) {
    client.subscriptions.delete(msg.channel);
    sendToClient(client.ws, {
      channel: 'system',
      event: 'unsubscribed',
      data: { channel: msg.channel },
      timestamp: new Date().toISOString(),
    });
  }

  if (msg.action === 'ping') {
    sendToClient(client.ws, {
      channel: 'system',
      event: 'pong',
      data: {},
      timestamp: new Date().toISOString(),
    });
  }
}

function removeClient(ws: WebSocket): void {
  const client = clients.get(ws);
  if (client) {
    const tenantSet = tenantClients.get(client.tenantId);
    if (tenantSet) {
      tenantSet.delete(ws);
      if (tenantSet.size === 0) {
        tenantClients.delete(client.tenantId);
      }
    }
    clients.delete(ws);
  }
}

function sendToClient(ws: WebSocket, message: WsMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

// ---------------------------------------------------------------------------
// Server-side push functions — call these from services/consumers
// ---------------------------------------------------------------------------

/** Broadcast to all clients of a tenant that are subscribed to the channel */
export function broadcastToTenant(tenantId: string, channel: string, event: string, data: unknown): void {
  const sockets = tenantClients.get(tenantId);
  if (!sockets) return;

  const message: WsMessage = {
    channel,
    event,
    data,
    timestamp: new Date().toISOString(),
  };

  const payload = JSON.stringify(message);

  for (const ws of sockets) {
    const client = clients.get(ws);
    if (client?.subscriptions.has(channel) && ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  }
}

/** Push agent status update to tenant */
export function pushAgentStatus(tenantId: string, agentType: string, status: string, details?: unknown): void {
  broadcastToTenant(tenantId, 'agent:status', 'agent_status_changed', {
    agentType,
    status,
    ...((details && typeof details === 'object') ? details : {}),
  });
}

/** Push task progress to tenant */
export function pushTaskProgress(tenantId: string, taskId: string, progress: number, metadata?: unknown): void {
  broadcastToTenant(tenantId, 'task:progress', 'task_progress', {
    taskId,
    progress, // 0-100
    ...((metadata && typeof metadata === 'object') ? metadata : {}),
  });
}

/** Push task completion to tenant */
export function pushTaskCompleted(tenantId: string, taskId: string, taskType: string, result?: unknown): void {
  broadcastToTenant(tenantId, 'task:progress', 'task_completed', {
    taskId,
    taskType,
    result,
  });
}

/** Push alert to tenant */
export function pushAlert(tenantId: string, alertType: string, message: string, severity: 'info' | 'warning' | 'critical', data?: unknown): void {
  broadcastToTenant(tenantId, 'alerts', 'alert', {
    alertType,
    message,
    severity,
    ...((data && typeof data === 'object') ? data : {}),
  });
}

/** Push SLA breach to tenant */
export function pushSlaBreach(tenantId: string, taskId: string, breachType: string, details: unknown): void {
  broadcastToTenant(tenantId, 'sla:breaches', 'sla_breach', {
    taskId,
    breachType,
    ...((details && typeof details === 'object') ? details : {}),
  });
}

/** Get current connection stats */
export function getWsStats(): { totalClients: number; tenantCount: number; subscriptionCounts: Record<string, number> } {
  const subscriptionCounts: Record<string, number> = {};
  for (const [, client] of clients) {
    for (const sub of client.subscriptions) {
      subscriptionCounts[sub] = (subscriptionCounts[sub] ?? 0) + 1;
    }
  }

  return {
    totalClients: clients.size,
    tenantCount: tenantClients.size,
    subscriptionCounts,
  };
}

/** Graceful shutdown — close all connections */
export async function closeWebSocketServer(): Promise<void> {
  if (!wss) return;

  for (const [ws] of clients) {
    ws.close(1001, 'Server shutting down');
  }
  clients.clear();
  tenantClients.clear();

  return new Promise((resolve) => {
    wss!.close(() => {
      wss = null;
      resolve();
    });
  });
}

/**
 * WebSocket client singleton for the NexusZero dashboard.
 * Connects to the API Gateway WS endpoint with JWT auth,
 * auto-reconnects with exponential backoff, and dispatches
 * incoming messages to channel subscribers.
 */

export interface WsMessage {
  channel: string;
  event: string;
  data: unknown;
  timestamp: string;
}

type MessageHandler = (event: string, data: unknown) => void;

const MAX_RECONNECT_DELAY = 30_000;
const INITIAL_RECONNECT_DELAY = 1_000;

class NexusWebSocketClient {
  private ws: WebSocket | null = null;
  private token: string | null = null;
  private subscribers = new Map<string, Set<MessageHandler>>();
  private reconnectDelay = INITIAL_RECONNECT_DELAY;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private intentionalClose = false;
  private _state: 'disconnected' | 'connecting' | 'connected' = 'disconnected';
  private stateListeners = new Set<(state: typeof this._state) => void>();

  get state() {
    return this._state;
  }

  private setState(state: typeof this._state) {
    this._state = state;
    for (const listener of this.stateListeners) {
      listener(state);
    }
  }

  onStateChange(listener: (state: 'disconnected' | 'connecting' | 'connected') => void): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  connect(token: string): void {
    if (this.ws && this.token === token) return;

    this.token = token;
    this.intentionalClose = false;
    this.doConnect();
  }

  disconnect(): void {
    this.intentionalClose = true;
    this.token = null;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }

    this.setState('disconnected');
  }

  subscribe(channel: string, handler: MessageHandler): () => void {
    if (!this.subscribers.has(channel)) {
      this.subscribers.set(channel, new Set());
    }
    this.subscribers.get(channel)!.add(handler);

    // If connected, send subscribe message to server
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ action: 'subscribe', channel }));
    }

    return () => {
      const handlers = this.subscribers.get(channel);
      if (handlers) {
        handlers.delete(handler);
        if (handlers.size === 0) {
          this.subscribers.delete(channel);
          // Unsubscribe from server
          if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ action: 'unsubscribe', channel }));
          }
        }
      }
    };
  }

  private doConnect(): void {
    if (!this.token) return;

    this.setState('connecting');

    const wsBase = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000')
      .replace(/^http/, 'ws')
      .replace(/\/api\/v1$/, '');

    const url = `${wsBase}/ws?token=${encodeURIComponent(this.token)}`;

    try {
      this.ws = new WebSocket(url);
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.setState('connected');
      this.reconnectDelay = INITIAL_RECONNECT_DELAY;

      // Re-subscribe to all active channels
      for (const channel of this.subscribers.keys()) {
        this.ws?.send(JSON.stringify({ action: 'subscribe', channel }));
      }
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as WsMessage;
        this.dispatch(msg);
      } catch {
        // Invalid message — ignore
      }
    };

    this.ws.onclose = () => {
      this.ws = null;
      this.setState('disconnected');

      if (!this.intentionalClose) {
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = () => {
      // onclose will fire after onerror — reconnect handled there
    };
  }

  private dispatch(msg: WsMessage): void {
    const handlers = this.subscribers.get(msg.channel);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(msg.event, msg.data);
        } catch {
          // Subscriber error — don't crash the WS loop
        }
      }
    }
  }

  private scheduleReconnect(): void {
    if (this.intentionalClose || this.reconnectTimer) return;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.doConnect();
    }, this.reconnectDelay);

    // Exponential backoff: 1s → 2s → 4s → 8s → ... → 30s max
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, MAX_RECONNECT_DELAY);
  }
}

/** Singleton WS client instance */
export const wsClient = new NexusWebSocketClient();

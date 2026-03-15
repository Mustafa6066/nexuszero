const _rawBase = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000').replace(/\/$/, '');
// Handle case where NEXT_PUBLIC_API_URL already includes the /api/v1 suffix
const API_BASE = _rawBase.endsWith('/api/v1') ? _rawBase : `${_rawBase}/api/v1`;
const REQUEST_TIMEOUT_MS = 15_000;

class ApiClient {
  private token: string | null = null;

  setToken(token: string) {
    this.token = token;
  }

  clearToken() {
    this.token = null;
  }

  hasToken(): boolean {
    return this.token !== null;
  }

  getToken(): string | null {
    return this.token;
  }

  private async parseResponse(response: Response): Promise<unknown> {
    if (response.status === 204 || response.status === 205) {
      return undefined;
    }

    const text = await response.text().catch(() => '');
    if (!text.trim()) {
      return undefined;
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      try {
        return JSON.parse(text);
      } catch {
        return text;
      }
    }

    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  private extractErrorMessage(body: unknown, response: Response): string {
    const messages: string[] = [];

    const visit = (value: unknown, depth = 0): void => {
      if (depth > 3 || value == null) {
        return;
      }

      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed) {
          messages.push(trimmed);
        }
        return;
      }

      if (Array.isArray(value)) {
        for (const item of value.slice(0, 3)) {
          visit(item, depth + 1);
        }
        return;
      }

      if (typeof value === 'object') {
        const record = value as Record<string, unknown>;
        for (const key of ['message', 'error', 'detail', 'details', 'title', 'reason']) {
          visit(record[key], depth + 1);
        }
        visit(record.errors, depth + 1);
        visit(record.data, depth + 1);
      }
    };

    visit(body);

    const uniqueMessages = [...new Set(messages)].filter(Boolean);
    if (uniqueMessages.length > 0) {
      return uniqueMessages.slice(0, 3).join('; ').slice(0, 500);
    }

    return response.statusText || `API error: ${response.status}`;
  }

  private mergeAbortSignals(signals: AbortSignal[]): { signal: AbortSignal; cleanup: () => void } {
    if (typeof AbortSignal.any === 'function') {
      return { signal: AbortSignal.any(signals), cleanup: () => {} };
    }

    const controller = new AbortController();
    const onAbort = () => controller.abort();

    for (const signal of signals) {
      if (signal.aborted) {
        controller.abort();
        return { signal: controller.signal, cleanup: () => {} };
      }

      signal.addEventListener('abort', onAbort);
    }

    return {
      signal: controller.signal,
      cleanup: () => {
        for (const signal of signals) {
          signal.removeEventListener('abort', onAbort);
        }
      },
    };
  }

  private async request<T>(path: string, options: RequestInit = {}, config: { authRequired?: boolean } = {}): Promise<T> {
    const authRequired = config.authRequired !== false;

    if (authRequired && !this.token) {
      throw new Error('Not authenticated');
    }

    const headers = new Headers(options.headers);
    if (authRequired && this.token) {
      headers.set('Authorization', `Bearer ${this.token}`);
    }

    if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    const timeoutController = new AbortController();
    const timeout = setTimeout(() => timeoutController.abort(), REQUEST_TIMEOUT_MS);
    const mergedSignal = options.signal
      ? this.mergeAbortSignals([options.signal, timeoutController.signal])
      : { signal: timeoutController.signal, cleanup: () => {} };

    try {
      const response = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers,
        signal: mergedSignal.signal,
      });

      const body = await this.parseResponse(response);

      if (!response.ok) {
        if (response.status === 401) {
          this.clearToken();
        }

        const message = this.extractErrorMessage(body, response);

        throw new Error(message || `API error: ${response.status}`);
      }

      return body as T;
    } catch (error) {
      if (timeoutController.signal.aborted && !options.signal?.aborted) {
        throw new Error('Request timed out. Please try again.');
      }

      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new Error('Request was cancelled.');
      }

      if (error instanceof Error) {
        throw error;
      }

      throw new Error('Request failed');
    } finally {
      clearTimeout(timeout);
      mergedSignal.cleanup();
    }
  }

  async get<T>(path: string): Promise<T> {
    return this.request<T>(path);
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async patch<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  }

  async delete<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: 'DELETE' });
  }

  // Auth
  login(email: string, password: string) {
    return this.request<{ token: string; user: any }>(
      '/auth/login',
      {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      },
      { authRequired: false },
    );
  }
  getMe() { return this.get<any>('/tenants/me'); }

  // Campaigns
  getCampaigns(params?: Record<string, string>) {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return this.get<any>(`/campaigns${qs}`).then((r) => (Array.isArray(r) ? r : r?.data ?? []));
  }
  getCampaign(id: string) { return this.get<any>(`/campaigns/${id}`); }
  createCampaign(data: any) { return this.post<any>('/campaigns', data); }
  updateCampaign(id: string, data: any) { return this.patch<any>(`/campaigns/${id}`, data); }
  deleteCampaign(id: string) { return this.delete(`/campaigns/${id}`); }

  // Agents
  getAgents() { return this.get<any[]>('/agents'); }
  getAgent(id: string) { return this.get<any>(`/agents/${id}`); }
  getAgentTasks(id: string) { return this.get<any[]>(`/agents/${id}/tasks`); }
  signalAgent(id: string, signal: any) { return this.post(`/agents/${id}/signal`, signal); }
  getAgentStats() { return this.get<any>('/agents/stats/overview'); }

  // Analytics
  getAnalytics(params?: Record<string, string>) {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return this.get<any[]>(`/analytics/data-points${qs}`);
  }
  getAnalyticsSummary() { return this.get<any>('/analytics/summary'); }
  getFunnel() { return this.get<any[]>('/analytics/funnel'); }
  getForecasts() { return this.get<any[]>('/analytics/forecasts'); }

  // Creatives
  getCreatives(params?: Record<string, string>) {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return this.get<any>(`/creatives${qs}`).then((r) => (Array.isArray(r) ? r : r?.data ?? []));
  }
  getCreative(id: string) { return this.get<any>(`/creatives/${id}`); }
  generateCreative(data: any) { return this.post<any>('/creatives/generate', data); }

  // AEO
  getCitations() { return this.get<any[]>('/aeo/citations'); }
  getEntities() { return this.get<any[]>('/aeo/entities'); }
  getVisibility() { return this.get<any[]>('/aeo/visibility'); }
  scanCitations(data: any) { return this.post<any>('/aeo/scan', data); }

  // Webhooks
  getWebhooks() { return this.get<any[]>('/webhooks'); }
  createWebhook(data: any) { return this.post<any>('/webhooks', data); }
  deleteWebhook(id: string) { return this.delete(`/webhooks/${id}`); }

  // Integrations
  getIntegrations() { return this.get<any[]>('/integrations'); }
  getIntegration(platform: string) { return this.get<any>(`/integrations/${platform}`); }
  disconnectIntegration(platform: string) { return this.delete(`/integrations/${platform}`); }
  connectIntegration(platform: string, config?: any) { return this.post<any>('/integrations/connect', { platform, config }); }
  connectApiKey(platform: string, apiKey: string) { return this.post<any>('/integrations/connect/api-key', { platform, apiKey }); }
  reconnectIntegration(platform: string) { return this.post<any>(`/integrations/reconnect/${platform}`); }
  getIntegrationHealth(platform: string) { return this.get<any[]>(`/integrations/${platform}/health`); }
  getIntegrationHealthSummary() { return this.get<any>('/integrations/health/summary'); }
  detectTechStack(websiteUrl: string) { return this.post<any>('/integrations/detect', { websiteUrl }); }
  startOnboarding(websiteUrl: string) { return this.post<any>('/integrations/onboarding/start', { websiteUrl }); }
  completeOnboarding() { return this.post<any>('/integrations/onboarding/complete'); }
  activateAgents(agentTypes: string[]) { return this.post<any>('/integrations/activate-agents', { agentTypes }); }

  // Assistant
  getAssistantSessions() { return this.get<any[]>('/assistant/sessions'); }
  getSessionMessages(sessionId: string) { return this.get<any[]>(`/assistant/sessions/${sessionId}/messages`); }

  // Intelligence
  getIntelligenceSummary() { return this.get<any>('/intelligence/summary'); }

  // Approvals
  getApprovals(status = 'pending') { return this.get<any[]>(`/approvals?status=${status}`); }
  getApprovalCount() { return this.get<{ count: number }>('/approvals/count'); }
  approveItem(id: string, note?: string) { return this.post<any>(`/approvals/${id}/approve`, { note }); }
  rejectItem(id: string, note?: string) { return this.post<any>(`/approvals/${id}/reject`, { note }); }
  getAutonomyLevel() { return this.get<{ autonomyLevel: string }>('/approvals/autonomy'); }
  setAutonomyLevel(autonomyLevel: string) { return this.patch<any>('/approvals/autonomy', { autonomyLevel }); }

  // Alert Rules
  getAlertRules() { return this.get<any[]>('/alerts'); }
  createAlertRule(data: any) { return this.post<any>('/alerts', data); }
  updateAlertRule(id: string, data: any) { return this.patch<any>(`/alerts/${id}`, data); }
  deleteAlertRule(id: string) { return this.delete(`/alerts/${id}`); }

  // Streaks
  getMyStreak() { return this.get<any>('/streaks/me'); }

  // Compound Insights
  getCompoundInsights() { return this.get<any[]>('/insights'); }

  // Scanner
  runPreflightScan(websiteUrl: string) { return this.post<any>('/scanner/preflight', { websiteUrl }); }

  // Engines
  deployEngine(data: { websiteUrl: string; companyName: string; agents: string[]; tier: string; platforms?: string[]; skipPreflight?: boolean }) {
    return this.post<any>('/engines/deploy', data);
  }
}

export const api = new ApiClient();

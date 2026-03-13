const _rawBase = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000').replace(/\/$/, '');
// Handle case where NEXT_PUBLIC_API_URL already includes the /api/v1 suffix
const API_BASE = _rawBase.endsWith('/api/v1') ? _rawBase : `${_rawBase}/api/v1`;

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

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    if (!this.token) {
      throw new Error('Not authenticated');
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> || {}),
      'Authorization': `Bearer ${this.token}`,
    };

    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({ message: response.statusText }));
      // Gateway returns { error: { message } }, but handle flat { message } too
      const message = body?.error?.message ?? body?.message ?? `API error: ${response.status}`;
      throw new Error(message);
    }

    return response.json();
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
  login(email: string, password: string) { return this.post<{ token: string; user: any }>('/auth/login', { email, password }); }
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
  reconnectIntegration(platform: string) { return this.post<any>(`/integrations/reconnect/${platform}`); }
  getIntegrationHealth(platform: string) { return this.get<any[]>(`/integrations/${platform}/health`); }
  getIntegrationHealthSummary() { return this.get<any>('/integrations/health/summary'); }
  detectTechStack(websiteUrl: string) { return this.post<any>('/integrations/detect', { websiteUrl }); }
  startOnboarding(websiteUrl: string) { return this.post<any>('/integrations/onboarding/start', { websiteUrl }); }
  completeOnboarding() { return this.post<any>('/integrations/onboarding/complete'); }

  // Assistant
  getAssistantSessions() { return this.get<any[]>('/assistant/sessions'); }
  getSessionMessages(sessionId: string) { return this.get<any[]>(`/assistant/sessions/${sessionId}/messages`); }
}

export const api = new ApiClient();

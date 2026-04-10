'use client';

import { create } from 'zustand';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { wsClient } from './ws-client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AgentStatus {
  agentType: string;
  status: string;
  activeJobs?: number;
  [key: string]: unknown;
}

interface TaskProgress {
  taskId: string;
  taskType?: string;
  agentType?: string;
  progress?: number;
  [key: string]: unknown;
}

interface Alert {
  alertType: string;
  message: string;
  severity: 'info' | 'warning' | 'critical';
  timestamp: string;
  [key: string]: unknown;
}

interface ActivityEntry {
  id: string;
  channel: string;
  event: string;
  data: unknown;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

interface WsState {
  connectionState: 'disconnected' | 'connecting' | 'connected';
  isDegraded: boolean;
  agentStatuses: Map<string, AgentStatus>;
  taskProgress: Map<string, TaskProgress>;
  alerts: Alert[];
  activityFeed: ActivityEntry[];

  setConnectionState: (state: WsState['connectionState']) => void;
  setDegraded: (degraded: boolean) => void;
  updateAgentStatus: (status: AgentStatus) => void;
  updateTaskProgress: (progress: TaskProgress) => void;
  addAlert: (alert: Alert) => void;
  addActivity: (entry: ActivityEntry) => void;
  clearAlerts: () => void;
}

const MAX_ACTIVITY_ENTRIES = 100;
const MAX_ALERTS = 50;

let activityCounter = 0;

export const useWsStore = create<WsState>((set) => ({
  connectionState: 'disconnected',
  isDegraded: false,
  agentStatuses: new Map(),
  taskProgress: new Map(),
  alerts: [],
  activityFeed: [],

  setConnectionState: (connectionState) => set({ connectionState }),

  setDegraded: (isDegraded) => set({ isDegraded }),

  updateAgentStatus: (status) =>
    set((state) => {
      const next = new Map(state.agentStatuses);
      next.set(status.agentType, status);
      return { agentStatuses: next };
    }),

  updateTaskProgress: (progress) =>
    set((state) => {
      const next = new Map(state.taskProgress);
      next.set(progress.taskId, progress);
      return { taskProgress: next };
    }),

  addAlert: (alert) =>
    set((state) => ({
      alerts: [alert, ...state.alerts].slice(0, MAX_ALERTS),
    })),

  addActivity: (entry) =>
    set((state) => ({
      activityFeed: [entry, ...state.activityFeed].slice(0, MAX_ACTIVITY_ENTRIES),
    })),

  clearAlerts: () => set({ alerts: [] }),
}));

// ---------------------------------------------------------------------------
// React hook: subscribe to WS channels and invalidate TanStack queries
// ---------------------------------------------------------------------------

export function useWsSubscriptions(): void {
  const queryClient = useQueryClient();
  const { updateAgentStatus, updateTaskProgress, addAlert, addActivity, setConnectionState } = useWsStore();

  useEffect(() => {
    const unsubState = wsClient.onStateChange(setConnectionState);

    const unsubAgent = wsClient.subscribe('agent:status', (event, data) => {
      const status = data as AgentStatus;
      updateAgentStatus(status);
      addActivity({
        id: `act-${++activityCounter}`,
        channel: 'agent:status',
        event,
        data,
        timestamp: new Date().toISOString(),
      });
      // Invalidate agents query so any polling-based components refresh
      queryClient.invalidateQueries({ queryKey: ['agents'] });
    });

    const unsubTask = wsClient.subscribe('task:progress', (event, data) => {
      const progress = data as TaskProgress;
      updateTaskProgress(progress);
      addActivity({
        id: `act-${++activityCounter}`,
        channel: 'task:progress',
        event,
        data,
        timestamp: new Date().toISOString(),
      });
      if (event === 'task_completed') {
        // Invalidate analytics on task completion — new data likely available
        queryClient.invalidateQueries({ queryKey: ['analytics'] });
      }
    });

    const unsubAlerts = wsClient.subscribe('alerts', (event, data) => {
      const alert = data as Alert;
      alert.timestamp = new Date().toISOString();
      addAlert(alert);
      addActivity({
        id: `act-${++activityCounter}`,
        channel: 'alerts',
        event,
        data,
        timestamp: alert.timestamp,
      });
    });

    const unsubAnalytics = wsClient.subscribe('analytics:live', (_event, _data) => {
      queryClient.invalidateQueries({ queryKey: ['analytics'] });
    });

    const unsubOnboarding = wsClient.subscribe('onboarding:progress', (event, data) => {
      addActivity({
        id: `act-${++activityCounter}`,
        channel: 'onboarding:progress',
        event,
        data,
        timestamp: new Date().toISOString(),
      });
      queryClient.invalidateQueries({ queryKey: ['tenant'] });
    });

    return () => {
      unsubState();
      unsubAgent();
      unsubTask();
      unsubAlerts();
      unsubAnalytics();
      unsubOnboarding();
    };
  }, [queryClient, updateAgentStatus, updateTaskProgress, addAlert, addActivity, setConnectionState]);
}

'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Bell, Bot, AlertTriangle, CheckCircle, Info, X, ChevronRight, Zap, Lightbulb } from 'lucide-react';
import { useAssistantStore } from '@/lib/assistant-store';
import { useLang } from '@/app/providers';
import type { Translations } from '@/lib/i18n/en';

interface Notification {
  id: string;
  type: 'ai_digest' | 'alert' | 'activity' | 'health' | 'feature';
  priority: 'critical' | 'advisory' | 'info';
  title: string;
  body: string;
  timestamp: number;
  read: boolean;
}

function generateNotifications(agents: any[], stats: any, intelligence: any, t: Translations): Notification[] {
  const notifications: Notification[] = [];
  const now = Date.now();

  // AI Digest — daily summary
  const totalTasks = stats?.tasksToday ?? 0;
  const successRate = stats?.successRate ?? 0;
  if (totalTasks > 0) {
    notifications.push({
      id: 'digest-today',
      type: 'ai_digest',
      priority: 'info',
      title: t.notificationTray.dailyAIDigest,
      body: `Your agents completed ${totalTasks} tasks today with a ${(successRate * 100).toFixed(0)}% success rate.`,
      timestamp: now,
      read: false,
    });
  }

  // Alert on error agents
  const errorAgents = (agents ?? []).filter((a: any) => a.status === 'error');
  for (const agent of errorAgents) {
    notifications.push({
      id: `error-${agent.id}`,
      type: 'alert',
      priority: 'critical',
      title: `${(agent.type ?? 'Agent').replace('_', ' ')} ${t.notificationTray.agentError}`,
      body: t.notificationTray.agentErrorDesc,
      timestamp: agent.lastHeartbeat ? new Date(agent.lastHeartbeat).getTime() : now,
      read: false,
    });
  }

  // Low success rate warning
  if (totalTasks > 5 && successRate < 0.8) {
    notifications.push({
      id: 'low-success',
      type: 'alert',
      priority: 'advisory',
      title: t.notificationTray.lowSuccessRate,
      body: `Today's success rate is ${(successRate * 100).toFixed(0)}%, below the 80% threshold.`,
      timestamp: now,
      read: false,
    });
  }

  // Active agents activity
  const activeAgents = (agents ?? []).filter((a: any) => a.status === 'processing');
  if (activeAgents.length > 0) {
    notifications.push({
      id: 'active-agents',
      type: 'activity',
      priority: 'info',
      title: t.notificationTray.agentsWorking,
      body: t.notificationTray.agentsWorkingDesc(activeAgents.length),
      timestamp: now,
      read: false,
    });
  }

  // Intelligence: health warnings
  const healthWarnings = intelligence?.dashboard?.healthWarnings ?? intelligence?.guidance?.healthWarnings ?? [];
  for (const [i, warning] of healthWarnings.entries()) {
    if (typeof warning === 'string' && warning.trim()) {
      notifications.push({
        id: `health-${i}`,
        type: 'health',
        priority: 'advisory',
        title: t.notificationTray.healthWarning,
        body: warning,
        timestamp: now,
        read: false,
      });
    }
  }

  // Intelligence: performance alerts
  const perfAlerts = intelligence?.dashboard?.performanceAlerts ?? intelligence?.guidance?.performanceAlerts ?? [];
  for (const [i, alert] of perfAlerts.entries()) {
    if (typeof alert === 'string' && alert.trim()) {
      notifications.push({
        id: `perf-${i}`,
        type: 'alert',
        priority: 'advisory',
        title: 'Performance Alert',
        body: alert,
        timestamp: now,
        read: false,
      });
    }
  }

  // Intelligence: feature discovery
  const features = intelligence?.dashboard?.featureDiscovery ?? intelligence?.guidance?.featureDiscovery ?? [];
  for (const [i, feature] of features.entries()) {
    if (typeof feature === 'string' && feature.trim()) {
      notifications.push({
        id: `feat-${i}`,
        type: 'feature',
        priority: 'info',
        title: 'Tip',
        body: feature,
        timestamp: now,
        read: false,
      });
    }
  }

  return notifications.sort((a, b) => {
    const prio = { critical: 0, advisory: 1, info: 2 };
    return prio[a.priority] - prio[b.priority];
  });
}

const priorityConfig = {
  critical: { color: 'text-red-400', bg: 'bg-red-500/10', dot: 'bg-red-400', Icon: AlertTriangle },
  advisory: { color: 'text-yellow-400', bg: 'bg-yellow-500/10', dot: 'bg-yellow-400', Icon: AlertTriangle },
  info: { color: 'text-primary', bg: 'bg-primary/10', dot: 'bg-primary', Icon: Info },
};

const typeIcons: Record<string, typeof Info> = {
  ai_digest: Bot,
  alert: AlertTriangle,
  activity: Zap,
  health: AlertTriangle,
  feature: Lightbulb,
};

export function NotificationTray() {
  const [isOpen, setIsOpen] = useState(false);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const trayRef = useRef<HTMLDivElement>(null);
  const assistantStore = useAssistantStore();
  const { t } = useLang();

  const { data: agents } = useQuery({
    queryKey: ['agents'],
    queryFn: () => api.getAgents(),
    staleTime: 30000,
  });

  const { data: stats } = useQuery({
    queryKey: ['agents', 'stats'],
    queryFn: () => api.getAgentStats(),
    staleTime: 30000,
  });

  const { data: intelligence } = useQuery({
    queryKey: ['intelligence', 'summary'],
    queryFn: () => api.getIntelligenceSummary(),
    staleTime: 5 * 60 * 1000, // 5 min
  });

  const notifications = useMemo(
    () => generateNotifications(agents ?? [], stats, intelligence, t),
    [agents, stats, intelligence, t],
  );
  const unreadCount = useMemo(
    () => notifications.filter((n) => !readIds.has(n.id)).length,
    [notifications, readIds],
  );

  const markAllRead = useCallback(() => {
    setReadIds(new Set(notifications.map((n) => n.id)));
  }, [notifications]);

  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (trayRef.current && !trayRef.current.contains(e.target as Node)) {
      setIsOpen(false);
    }
  }, []);

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, handleClickOutside]);

  return (
    <div ref={trayRef} className="relative">
      <button
        onClick={() => { setIsOpen(!isOpen); if (!isOpen) markAllRead(); }}
        title="Notifications"
        className="rounded-full p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-colors relative"
      >
        <Bell size={14} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-red-500 text-[8px] font-bold text-white flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full z-50 mt-2 w-[min(22rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-border/50 bg-card shadow-2xl shadow-black/30 animate-in fade-in slide-in-from-top-2 duration-150 sm:w-96">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/40">
            <h3 className="text-sm font-semibold">{t.notificationTray.title}</h3>
            <button
              onClick={() => setIsOpen(false)}
              className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-secondary transition-colors text-muted-foreground"
            >
              <X size={14} />
            </button>
          </div>

          {/* Notification list */}
          <div className="max-h-[min(24rem,calc(100vh-10rem))] overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="py-8 text-center">
                <CheckCircle className="w-8 h-8 text-green-400 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">{t.notificationTray.noNotifications}</p>
              </div>
            ) : (
              <div className="divide-y divide-border/30">
                {notifications.map((n) => {
                  const config = priorityConfig[n.priority];
                  const PrioIcon = typeIcons[n.type] ?? config.Icon;
                  return (
                    <div
                      key={n.id}
                      className={`px-4 py-3 flex gap-3 hover:bg-secondary/30 transition-colors ${
                        !readIds.has(n.id) ? 'bg-primary/[0.02]' : ''
                      }`}
                    >
                      <div className={`w-8 h-8 rounded-lg ${config.bg} flex items-center justify-center shrink-0`}>
                        <PrioIcon size={14} className={config.color} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-semibold truncate">{n.title}</p>
                          {!readIds.has(n.id) && <span className={`w-1.5 h-1.5 rounded-full ${config.dot} shrink-0`} />}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.body}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer - Ask NexusAI */}
          <div className="border-t border-border/40 px-4 py-2.5">
            <button
              onClick={() => { assistantStore.open(); setIsOpen(false); }}
              className="w-full flex items-center justify-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
            >
              <Bot size={12} />
              Ask NexusAI for details
              <ChevronRight size={12} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

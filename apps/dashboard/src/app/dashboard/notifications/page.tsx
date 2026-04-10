'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, Button, Badge } from '@/components/ui';
import { Bell, CheckCheck, AlertTriangle, Zap, Bot, Lightbulb, ShieldCheck, Clock } from 'lucide-react';

const ICON_MAP: Record<string, React.ElementType> = {
  alert: AlertTriangle,
  digest: Bot,
  activity: Zap,
  health: ShieldCheck,
  feature: Lightbulb,
  approval: Clock,
  system: Bell,
};

const PRIORITY_VARIANT: Record<string, 'destructive' | 'warning' | 'outline'> = {
  critical: 'destructive',
  advisory: 'warning',
  info: 'outline',
};

export default function NotificationsPage() {
  const queryClient = useQueryClient();
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const [page, setPage] = useState(0);
  const limit = 25;

  const { data, isLoading } = useQuery({
    queryKey: ['notifications', showUnreadOnly, page],
    queryFn: () => api.getNotifications({ limit, offset: page * limit, unread: showUnreadOnly }),
  });

  const markReadMutation = useMutation({
    mutationFn: (id: string) => api.markNotificationRead(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => api.markAllNotificationsRead(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const unread = data?.unread ?? 0;
  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Notifications</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {unread > 0 ? `${unread} unread notification${unread !== 1 ? 's' : ''}` : 'All caught up'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={showUnreadOnly ? 'primary' : 'outline'}
            size="sm"
            onClick={() => { setShowUnreadOnly(!showUnreadOnly); setPage(0); }}
          >
            Unread only
          </Button>
          {unread > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => markAllReadMutation.mutate()}
              disabled={markAllReadMutation.isPending}
            >
              <CheckCheck className="h-4 w-4 mr-1" /> Mark all read
            </Button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <Card key={i} className="animate-pulse">
              <div className="flex gap-3">
                <div className="h-8 w-8 rounded-full bg-secondary" />
                <div className="flex-1">
                  <div className="h-4 w-2/3 rounded bg-secondary" />
                  <div className="mt-2 h-3 w-full rounded bg-secondary" />
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : items.length === 0 ? (
        <Card className="text-center py-12">
          <Bell className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">
            {showUnreadOnly ? 'No unread notifications' : 'No notifications yet'}
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {items.map((notification: any) => {
            const Icon = ICON_MAP[notification.type] || Bell;
            return (
              <Card
                key={notification.id}
                className={`cursor-pointer transition-colors hover:bg-secondary/50 ${
                  !notification.isRead ? 'border-l-2 border-l-primary' : 'opacity-70'
                }`}
                onClick={() => {
                  if (!notification.isRead) markReadMutation.mutate(notification.id);
                }}
              >
                <div className="flex items-start gap-3">
                  <div className={`rounded-full p-2 ${!notification.isRead ? 'bg-primary/10' : 'bg-secondary'}`}>
                    <Icon className={`h-4 w-4 ${!notification.isRead ? 'text-primary' : 'text-muted-foreground'}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className={`text-sm ${!notification.isRead ? 'font-semibold' : 'font-medium'}`}>
                        {notification.title}
                      </p>
                      <Badge variant={PRIORITY_VARIANT[notification.priority] || 'outline'} className="text-[10px]">
                        {notification.priority}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{notification.message}</p>
                    <div className="flex items-center gap-3 mt-2">
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(notification.createdAt).toLocaleString()}
                      </span>
                      {notification.source && (
                        <span className="text-[10px] text-muted-foreground capitalize">
                          {notification.source}
                        </span>
                      )}
                    </div>
                  </div>
                  {!notification.isRead && (
                    <div className="h-2 w-2 rounded-full bg-primary mt-2 shrink-0" />
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-xs text-muted-foreground">{total} total notification{total !== 1 ? 's' : ''}</p>
          <div className="flex gap-1">
            <Button size="sm" variant="outline" onClick={() => setPage(p => p - 1)} disabled={page === 0}>
              Previous
            </Button>
            <span className="flex items-center px-3 text-xs text-muted-foreground">
              {page + 1} / {totalPages}
            </span>
            <Button size="sm" variant="outline" onClick={() => setPage(p => p + 1)} disabled={page >= totalPages - 1}>
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

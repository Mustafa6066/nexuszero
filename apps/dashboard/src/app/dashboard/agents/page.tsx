'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, Badge, Button } from '@/components/ui';
import { BarChartWidget } from '@/components/charts';

const AGENT_TYPES = ['seo', 'ad', 'data_nexus', 'aeo', 'creative'] as const;

const AGENT_COLORS: Record<string, string> = {
  seo: '#8b5cf6',
  ad: '#06b6d4',
  data_nexus: '#10b981',
  aeo: '#f59e0b',
  creative: '#ec4899',
};

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'destructive' | 'outline'> = {
  active: 'success',
  idle: 'outline',
  processing: 'warning',
  error: 'destructive',
  paused: 'warning',
};

export default function AgentsPage() {
  const queryClient = useQueryClient();

  const { data: agents, isLoading } = useQuery({
    queryKey: ['agents'],
    queryFn: () => api.getAgents(),
    refetchInterval: 10000,
  });

  const { data: stats } = useQuery({
    queryKey: ['agents', 'stats'],
    queryFn: () => api.getAgentStats(),
    refetchInterval: 30000,
  });

  const signalMutation = useMutation({
    mutationFn: ({ id, signal }: { id: string; signal: any }) => api.signalAgent(id, signal),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['agents'] }),
  });

  const tasksByType = AGENT_TYPES.map((type) => {
    const typeAgents = (agents ?? []).filter((a: any) => a.type === type);
    return {
      name: type.replace('_', ' '),
      completed: typeAgents.reduce((sum: number, a: any) => sum + (a.tasksCompleted ?? 0), 0),
      failed: typeAgents.reduce((sum: number, a: any) => sum + (a.tasksFailed ?? 0), 0),
    };
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">AI Agents</h1>
        <p className="text-sm text-muted-foreground mt-1">Monitor and manage your autonomous agent swarm.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <p className="text-sm text-muted-foreground">Total Agents</p>
          <p className="mt-1 text-2xl font-bold">{agents?.length ?? 0}</p>
        </Card>
        <Card>
          <p className="text-sm text-muted-foreground">Active</p>
          <p className="mt-1 text-2xl font-bold text-green-400">
            {agents?.filter((a: any) => a.status === 'processing').length ?? 0}
          </p>
        </Card>
        <Card>
          <p className="text-sm text-muted-foreground">Tasks Today</p>
          <p className="mt-1 text-2xl font-bold">{stats?.tasksToday ?? 0}</p>
        </Card>
        <Card>
          <p className="text-sm text-muted-foreground">Success Rate</p>
          <p className="mt-1 text-2xl font-bold">{((stats?.successRate ?? 0) * 100).toFixed(1)}%</p>
        </Card>
      </div>

      <Card>
        <h3 className="mb-4 text-sm font-medium text-muted-foreground">Tasks by Agent Type</h3>
        <BarChartWidget
          data={tasksByType}
          bars={[
            { dataKey: 'completed', color: '#10b981' },
            { dataKey: 'failed', color: '#ef4444' },
          ]}
          xAxisKey="name"
        />
      </Card>

      <div className="space-y-4">
        <h3 className="text-sm font-medium text-muted-foreground">All Agents</h3>
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="animate-pulse">
                <div className="h-4 w-1/3 rounded bg-secondary" />
                <div className="mt-2 h-3 w-1/4 rounded bg-secondary" />
              </Card>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {(agents ?? []).map((agent: any) => (
              <Card key={agent.id} className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div
                    className="h-10 w-10 rounded-lg flex items-center justify-center text-xs font-bold uppercase"
                    style={{ backgroundColor: (AGENT_COLORS[agent.type] ?? '#8b5cf6') + '20', color: AGENT_COLORS[agent.type] ?? '#8b5cf6' }}
                  >
                    {(agent.type ?? '??').slice(0, 2)}
                  </div>
                  <div>
                    <p className="text-sm font-medium capitalize">{(agent.type ?? 'unknown').replace('_', ' ')} Agent</p>
                    <p className="text-xs text-muted-foreground">
                      {agent.tasksCompleted ?? 0} completed &middot; {agent.tasksFailed ?? 0} failed
                      {agent.lastHeartbeat && <> &middot; Last active: {new Date(agent.lastHeartbeat).toLocaleTimeString()}</>}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant={STATUS_VARIANT[agent.status] ?? 'outline'}>{agent.status}</Badge>
                  {agent.status === 'processing' && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => signalMutation.mutate({ id: agent.id, signal: { type: 'pause' } })}
                    >
                      Pause
                    </Button>
                  )}
                  {agent.status === 'paused' && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => signalMutation.mutate({ id: agent.id, signal: { type: 'resume' } })}
                    >
                      Resume
                    </Button>
                  )}
                  {agent.status === 'error' && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => signalMutation.mutate({ id: agent.id, signal: { type: 'restart' } })}
                    >
                      Restart
                    </Button>
                  )}
                </div>
              </Card>
            ))}
            {(!agents || agents.length === 0) && (
              <Card className="text-center py-12">
                <p className="text-muted-foreground">No agents deployed yet.</p>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

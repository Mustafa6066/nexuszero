'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card } from '@/components/ui';
import { AlertTriangle, RotateCcw, Trash2, Inbox } from 'lucide-react';

const STATUSES = ['all', 'pending', 'retrying', 'resolved', 'discarded'] as const;
const SOURCES = ['all', 'kafka', 'bullmq', 'webhook'] as const;

export default function DlqPage() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<string>('all');
  const [source, setSource] = useState<string>('all');
  const [page, setPage] = useState(1);

  const params: Record<string, string> = { page: String(page), limit: '20' };
  if (status !== 'all') params.status = status;
  if (source !== 'all') params.source = source;

  const { data, isLoading } = useQuery({
    queryKey: ['dlq', status, source, page],
    queryFn: () => api.getDlqEntries(params),
  });

  const { data: stats } = useQuery({
    queryKey: ['dlq', 'stats'],
    queryFn: () => api.getDlqStats(),
  });

  const retryMutation = useMutation({
    mutationFn: (id: string) => api.retryDlqEntry(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dlq'] });
    },
  });

  const discardMutation = useMutation({
    mutationFn: (id: string) => api.discardDlqEntry(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dlq'] });
    },
  });

  const items = data?.items ?? [];
  const pagination = data?.pagination;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dead Letter Queue</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Failed messages awaiting manual review or retry
        </p>
      </div>

      {/* Stats summary */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {(['pending', 'retrying', 'resolved', 'discarded'] as const).map((s) => (
          <Card key={s} className="flex items-center gap-3 p-4">
            <div className={`rounded-full p-2 ${s === 'pending' ? 'bg-amber-500/10 text-amber-500' : s === 'retrying' ? 'bg-blue-500/10 text-blue-500' : s === 'resolved' ? 'bg-green-500/10 text-green-500' : 'bg-muted text-muted-foreground'}`}>
              {s === 'pending' ? <AlertTriangle size={16} /> : s === 'retrying' ? <RotateCcw size={16} /> : s === 'resolved' ? <Inbox size={16} /> : <Trash2 size={16} />}
            </div>
            <div>
              <p className="text-xs text-muted-foreground capitalize">{s}</p>
              <p className="text-lg font-semibold">{stats?.[s] ?? 0}</p>
            </div>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Status:</span>
          {STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => { setStatus(s); setPage(1); }}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${status === s ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'}`}
            >
              {s === 'all' ? 'All' : s}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Source:</span>
          {SOURCES.map((s) => (
            <button
              key={s}
              onClick={() => { setSource(s); setPage(1); }}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${source === s ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'}`}
            >
              {s === 'all' ? 'All' : s}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="px-4 py-3 font-medium">Source</th>
              <th className="px-4 py-3 font-medium">Topic</th>
              <th className="px-4 py-3 font-medium">Error</th>
              <th className="px-4 py-3 font-medium">Attempts</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Created</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">Loading…</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">No entries found</td></tr>
            ) : (
              items.map((item: any) => (
                <tr key={item.id} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                  <td className="px-4 py-3">
                    <span className="inline-flex rounded-full bg-secondary px-2 py-0.5 text-xs font-medium">
                      {item.source}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs max-w-[200px] truncate">{item.topic}</td>
                  <td className="px-4 py-3 max-w-[280px] truncate text-muted-foreground" title={item.errorMessage}>
                    {item.errorMessage}
                  </td>
                  <td className="px-4 py-3">{item.attempts}/{item.maxAttempts}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                      item.status === 'pending' ? 'bg-amber-500/10 text-amber-500' :
                      item.status === 'retrying' ? 'bg-blue-500/10 text-blue-500' :
                      item.status === 'resolved' ? 'bg-green-500/10 text-green-500' :
                      'bg-muted text-muted-foreground'
                    }`}>
                      {item.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                    {new Date(item.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      {(item.status === 'pending' || item.status === 'retrying') && (
                        <>
                          <button
                            onClick={() => retryMutation.mutate(item.id)}
                            disabled={retryMutation.isPending}
                            className="rounded p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                            title="Retry"
                          >
                            <RotateCcw size={14} />
                          </button>
                          <button
                            onClick={() => discardMutation.mutate(item.id)}
                            disabled={discardMutation.isPending}
                            className="rounded p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                            title="Discard"
                          >
                            <Trash2 size={14} />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>

      {/* Pagination */}
      {pagination && pagination.total > pagination.limit && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {(pagination.page - 1) * pagination.limit + 1}–{Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="rounded-lg px-3 py-1.5 text-sm bg-secondary text-secondary-foreground hover:bg-secondary/80 disabled:opacity-50"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={pagination.page * pagination.limit >= pagination.total}
              className="rounded-lg px-3 py-1.5 text-sm bg-secondary text-secondary-foreground hover:bg-secondary/80 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

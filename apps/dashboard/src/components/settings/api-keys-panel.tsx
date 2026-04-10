'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, Button, Badge } from '@/components/ui';
import { Key, Plus, Copy, Trash2, Check } from 'lucide-react';

export function ApiKeysPanel() {
  const queryClient = useQueryClient();
  const { data: keys = [], isLoading } = useQuery({
    queryKey: ['api-keys'],
    queryFn: () => api.getApiKeys(),
  });

  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: (data: { name: string; scopes?: string[] }) => api.createApiKey(data),
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
      setNewKey(result.key);
      setShowCreate(false);
      setName('');
      setError(null);
    },
    onError: (err: any) => setError(err?.message || 'Failed to create key'),
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) => api.revokeApiKey(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['api-keys'] }),
  });

  const handleCreate = () => {
    setError(null);
    if (!name.trim()) {
      setError('Key name is required');
      return;
    }
    createMutation.mutate({ name: name.trim() });
  };

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (isLoading) {
    return (
      <Card className="animate-pulse">
        <div className="h-4 w-1/3 rounded bg-secondary" />
        <div className="mt-4 space-y-3">
          {[1, 2].map((i) => <div key={i} className="h-12 rounded bg-secondary" />)}
        </div>
      </Card>
    );
  }

  const activeKeys = keys.filter((k: any) => k.isActive);
  const revokedKeys = keys.filter((k: any) => !k.isActive);

  return (
    <div className="space-y-4">
      {newKey && (
        <Card className="border-green-500/30 bg-green-500/5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-semibold text-green-400">API Key Created</p>
              <p className="text-xs text-muted-foreground mt-1">
                Copy this key now — it won&apos;t be shown again.
              </p>
              <code className="mt-2 block rounded bg-secondary px-3 py-2 text-xs font-mono break-all">
                {newKey}
              </code>
            </div>
            <button
              onClick={() => handleCopy(newKey)}
              className="rounded p-2 hover:bg-secondary transition-colors"
            >
              {copied ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
          <Button size="sm" variant="ghost" className="mt-2" onClick={() => setNewKey(null)}>
            Dismiss
          </Button>
        </Card>
      )}

      <Card>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Key className="h-4 w-4" /> API Keys
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              {activeKeys.length} active key{activeKeys.length !== 1 ? 's' : ''}
            </p>
          </div>
          <Button size="sm" onClick={() => setShowCreate(!showCreate)}>
            <Plus className="h-4 w-4 mr-1" /> Create Key
          </Button>
        </div>

        {showCreate && (
          <div className="mb-4 rounded-lg border border-border p-4 space-y-3">
            {error && <p className="text-xs text-red-400">{error}</p>}
            <input
              type="text"
              placeholder="Key name (e.g., Production API)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={handleCreate} disabled={createMutation.isPending}>
                {createMutation.isPending ? 'Creating...' : 'Create'}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setShowCreate(false); setError(null); }}>Cancel</Button>
            </div>
          </div>
        )}

        <div className="space-y-2">
          {activeKeys.length === 0 && !showCreate && (
            <p className="text-sm text-muted-foreground text-center py-4">No API keys yet</p>
          )}
          {activeKeys.map((key: any) => (
            <div key={key.id} className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
              <div>
                <p className="text-sm font-medium">{key.name}</p>
                <div className="flex items-center gap-2 mt-1">
                  <code className="text-xs text-muted-foreground font-mono">{key.keyPrefix}•••••</code>
                  <span className="text-xs text-muted-foreground">·</span>
                  <span className="text-xs text-muted-foreground">
                    Created {new Date(key.createdAt).toLocaleDateString()}
                  </span>
                  {key.lastUsedAt && (
                    <>
                      <span className="text-xs text-muted-foreground">·</span>
                      <span className="text-xs text-muted-foreground">
                        Last used {new Date(key.lastUsedAt).toLocaleDateString()}
                      </span>
                    </>
                  )}
                </div>
              </div>
              <button
                onClick={() => revokeMutation.mutate(key.id)}
                className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-red-400 transition-colors"
                title="Revoke key"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>

        {revokedKeys.length > 0 && (
          <div className="mt-4 pt-4 border-t border-border">
            <p className="text-xs text-muted-foreground mb-2">Revoked Keys</p>
            <div className="space-y-2">
              {revokedKeys.map((key: any) => (
                <div key={key.id} className="flex items-center justify-between rounded-lg border border-border/50 px-4 py-2 opacity-50">
                  <div>
                    <p className="text-sm font-medium line-through">{key.name}</p>
                    <code className="text-xs text-muted-foreground font-mono">{key.keyPrefix}•••••</code>
                  </div>
                  <Badge variant="destructive">Revoked</Badge>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

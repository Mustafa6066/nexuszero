'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, Button, Badge } from '@/components/ui';
import { UserPlus, Shield, Trash2 } from 'lucide-react';

const ROLE_LABELS: Record<string, string> = {
  owner: 'Owner',
  admin: 'Admin',
  member: 'Member',
  viewer: 'Viewer',
};

const ROLE_VARIANTS: Record<string, 'success' | 'default' | 'outline' | 'warning'> = {
  owner: 'warning',
  admin: 'success',
  member: 'default',
  viewer: 'outline',
};

export function TeamPanel() {
  const queryClient = useQueryClient();
  const { data: members = [], isLoading } = useQuery({
    queryKey: ['team', 'members'],
    queryFn: () => api.getTeamMembers(),
  });

  const [showInvite, setShowInvite] = useState(false);
  const [inviteForm, setInviteForm] = useState({ email: '', name: '', role: 'member' });
  const [error, setError] = useState<string | null>(null);

  const inviteMutation = useMutation({
    mutationFn: (data: { email: string; name: string; role: string }) => api.inviteTeamMember(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team'] });
      setShowInvite(false);
      setInviteForm({ email: '', name: '', role: 'member' });
      setError(null);
    },
    onError: (err: any) => setError(err?.message || 'Failed to invite member'),
  });

  const updateRoleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) => api.updateTeamMemberRole(userId, role),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['team'] }),
  });

  const removeMutation = useMutation({
    mutationFn: (userId: string) => api.removeTeamMember(userId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['team'] }),
  });

  const handleInvite = () => {
    setError(null);
    if (!inviteForm.email.trim() || !inviteForm.name.trim()) {
      setError('Email and name are required');
      return;
    }
    inviteMutation.mutate(inviteForm);
  };

  if (isLoading) {
    return (
      <Card className="animate-pulse">
        <div className="h-4 w-1/3 rounded bg-secondary" />
        <div className="mt-4 space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-12 rounded bg-secondary" />)}
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Shield className="h-4 w-4" /> Team Members
            </h3>
            <p className="text-xs text-muted-foreground mt-1">{members.length} member{members.length !== 1 ? 's' : ''}</p>
          </div>
          <Button size="sm" onClick={() => setShowInvite(!showInvite)}>
            <UserPlus className="h-4 w-4 mr-1" /> Invite
          </Button>
        </div>

        {showInvite && (
          <div className="mb-4 rounded-lg border border-border p-4 space-y-3">
            {error && <p className="text-xs text-red-400">{error}</p>}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <input
                type="text"
                placeholder="Name"
                value={inviteForm.name}
                onChange={(e) => setInviteForm({ ...inviteForm, name: e.target.value })}
                className="rounded-lg border border-border bg-secondary px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <input
                type="email"
                placeholder="Email"
                value={inviteForm.email}
                onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                className="rounded-lg border border-border bg-secondary px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <select
                value={inviteForm.role}
                onChange={(e) => setInviteForm({ ...inviteForm, role: e.target.value })}
                className="rounded-lg border border-border bg-secondary px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="admin">Admin</option>
                <option value="member">Member</option>
                <option value="viewer">Viewer</option>
              </select>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleInvite} disabled={inviteMutation.isPending}>
                {inviteMutation.isPending ? 'Sending...' : 'Send Invite'}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setShowInvite(false); setError(null); }}>Cancel</Button>
            </div>
          </div>
        )}

        <div className="space-y-2">
          {members.map((member: any) => (
            <div key={member.id} className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                  {(member.name || member.email)?.[0]?.toUpperCase() ?? '?'}
                </div>
                <div>
                  <p className="text-sm font-medium">{member.name || 'Unnamed'}</p>
                  <p className="text-xs text-muted-foreground">{member.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {member.role === 'owner' ? (
                  <Badge variant="warning">Owner</Badge>
                ) : (
                  <select
                    value={member.role}
                    onChange={(e) => updateRoleMutation.mutate({ userId: member.id, role: e.target.value })}
                    className="rounded border border-border bg-secondary px-2 py-1 text-xs"
                  >
                    <option value="admin">Admin</option>
                    <option value="member">Member</option>
                    <option value="viewer">Viewer</option>
                  </select>
                )}
                {member.role !== 'owner' && (
                  <button
                    onClick={() => removeMutation.mutate(member.id)}
                    className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-red-400 transition-colors"
                    title="Remove member"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

'use client';

import { useSession } from 'next-auth/react';

export type UserRole = 'owner' | 'admin' | 'member' | 'viewer';

const WRITE_ROLES = new Set<UserRole>(['owner', 'admin', 'member']);
const ADMIN_ROLES = new Set<UserRole>(['owner', 'admin']);

export function useRole(): { role: UserRole; canWrite: boolean; canAdmin: boolean; isOwner: boolean } {
  const { data: session } = useSession();
  const role = ((session as any)?.role ?? 'viewer') as UserRole;

  return {
    role,
    canWrite: WRITE_ROLES.has(role),
    canAdmin: ADMIN_ROLES.has(role),
    isOwner: role === 'owner',
  };
}

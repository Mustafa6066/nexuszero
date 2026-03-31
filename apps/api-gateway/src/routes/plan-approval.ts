import { Hono } from 'hono';
import {
  getPendingApprovals, approveRequest, rejectRequest,
} from '@nexuszero/queue';

const planApprovalRoutes = new Hono();

/** GET /plan-approvals — list pending approvals for tenant */
planApprovalRoutes.get('/', async (c) => {
  const tenantId = c.get('tenantId') as string;
  const approvals = await getPendingApprovals(tenantId);
  return c.json({ data: approvals });
});

/** POST /plan-approvals/:id/approve — approve a pending request */
planApprovalRoutes.post('/:id/approve', async (c) => {
  const approvalId = c.req.param('id');
  const userId = c.get('userId') as string;
  const body = await c.req.json<{ notes?: string }>().catch(() => ({}));

  const success = await approveRequest(approvalId, userId, body.notes);
  if (!success) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Approval not found or already resolved' } }, 404);
  }

  return c.json({ data: { approved: true } });
});

/** POST /plan-approvals/:id/reject — reject a pending request */
planApprovalRoutes.post('/:id/reject', async (c) => {
  const approvalId = c.req.param('id');
  const userId = c.get('userId') as string;
  const body = await c.req.json<{ notes?: string }>().catch(() => ({}));

  const success = await rejectRequest(approvalId, userId, body.notes);
  if (!success) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Approval not found or already resolved' } }, 404);
  }

  return c.json({ data: { rejected: true } });
});

export { planApprovalRoutes };
export default planApprovalRoutes;

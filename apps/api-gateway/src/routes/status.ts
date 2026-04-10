import { Hono } from 'hono';

const startedAt = Date.now();

const statusRoutes = new Hono();

// Public unauthenticated status endpoint
statusRoutes.get('/', async (c) => {
  const uptimeMs = Date.now() - startedAt;
  const uptimeSeconds = Math.floor(uptimeMs / 1000);

  const services = [
    { name: 'api-gateway', url: null },
    { name: 'orchestrator', url: process.env.ORCHESTRATOR_URL || 'http://localhost:4001' },
    { name: 'webhook-service', url: process.env.WEBHOOK_SERVICE_URL || 'http://localhost:4003' },
    { name: 'onboarding-service', url: process.env.ONBOARDING_SERVICE_URL || 'http://localhost:4004' },
  ];

  const results = await Promise.all(
    services.map(async (s) => {
      if (!s.url) {
        return { name: s.name, status: 'ok' as const };
      }
      try {
        const res = await fetch(`${s.url}/health`, { signal: AbortSignal.timeout(2000) });
        return { name: s.name, status: res.ok ? ('ok' as const) : ('degraded' as const) };
      } catch {
        return { name: s.name, status: 'unreachable' as const };
      }
    })
  );

  const allOk = results.every((r) => r.status === 'ok');

  return c.json({
    version: process.env.npm_package_version || '0.1.0',
    environment: process.env.NODE_ENV || 'development',
    uptime: uptimeSeconds,
    status: allOk ? 'operational' : 'degraded',
    services: results,
    timestamp: new Date().toISOString(),
  });
});

export { statusRoutes };

import { Hono } from 'hono';
import {
  listPlugins, getInstalledPlugins, getInstalledPlugin,
  installPlugin, uninstallPlugin, enablePlugin, disablePlugin,
  updatePluginConfig, getPluginManifest,
} from '@nexuszero/shared';

const pluginRoutes = new Hono();

/** GET /plugins/catalog — list all available plugins */
pluginRoutes.get('/catalog', async (c) => {
  const plugins = listPlugins();
  return c.json({ data: plugins });
});

/** GET /plugins — list installed plugins for tenant */
pluginRoutes.get('/', async (c) => {
  const tenantId = c.get('tenantId') as string;
  const plugins = getInstalledPlugins(tenantId);
  return c.json({ data: plugins });
});

/** POST /plugins/install — install a plugin */
pluginRoutes.post('/install', async (c) => {
  const tenantId = c.get('tenantId') as string;
  const body = await c.req.json<{ pluginId: string; config?: Record<string, unknown> }>();

  const manifest = getPluginManifest(body.pluginId);
  if (!manifest) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Plugin not found in catalog' } }, 404);
  }

  // Check if already installed
  const existing = getInstalledPlugin(tenantId, body.pluginId);
  if (existing) {
    return c.json({ error: { code: 'CONFLICT', message: 'Plugin already installed' } }, 409);
  }

  const instance = installPlugin(tenantId, manifest, body.config);
  return c.json({ data: instance }, 201);
});

/** DELETE /plugins/:pluginId — uninstall a plugin */
pluginRoutes.delete('/:pluginId', async (c) => {
  const tenantId = c.get('tenantId') as string;
  const pluginId = c.req.param('pluginId');

  const removed = uninstallPlugin(tenantId, pluginId);
  if (!removed) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Plugin not installed' } }, 404);
  }
  return c.json({ data: { uninstalled: true } });
});

/** POST /plugins/:pluginId/enable — enable a plugin */
pluginRoutes.post('/:pluginId/enable', async (c) => {
  const tenantId = c.get('tenantId') as string;
  const pluginId = c.req.param('pluginId');

  const success = enablePlugin(tenantId, pluginId);
  if (!success) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Plugin not installed' } }, 404);
  }
  return c.json({ data: { enabled: true } });
});

/** POST /plugins/:pluginId/disable — disable a plugin */
pluginRoutes.post('/:pluginId/disable', async (c) => {
  const tenantId = c.get('tenantId') as string;
  const pluginId = c.req.param('pluginId');

  const success = disablePlugin(tenantId, pluginId);
  if (!success) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Plugin not installed' } }, 404);
  }
  return c.json({ data: { disabled: true } });
});

/** PATCH /plugins/:pluginId/config — update plugin config */
pluginRoutes.patch('/:pluginId/config', async (c) => {
  const tenantId = c.get('tenantId') as string;
  const pluginId = c.req.param('pluginId');
  const body = await c.req.json<Record<string, unknown>>();

  const success = updatePluginConfig(tenantId, pluginId, body);
  if (!success) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Plugin not installed' } }, 404);
  }
  return c.json({ data: { updated: true } });
});

export { pluginRoutes };
export default pluginRoutes;

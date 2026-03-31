// ---------------------------------------------------------------------------
// Plugin Registry — in-memory registry for managing installed plugins
// ---------------------------------------------------------------------------

import type {
  PluginManifest,
  PluginInstance,
  PluginHook,
  PluginContext,
} from './plugin-types.js';

/** Available plugins (marketplace catalog) */
const pluginCatalog = new Map<string, PluginManifest>();

/** Installed plugins per tenant: tenantId -> pluginId -> instance */
const installedPlugins = new Map<string, Map<string, PluginInstance>>();

/** Registered hooks: hookName -> PluginHook[] (sorted by priority) */
const hookRegistry = new Map<string, PluginHook[]>();

// ---------------------------------------------------------------------------
// Catalog management
// ---------------------------------------------------------------------------

export function registerPluginInCatalog(manifest: PluginManifest): void {
  pluginCatalog.set(manifest.id, manifest);
}

export function getPluginManifest(pluginId: string): PluginManifest | undefined {
  return pluginCatalog.get(pluginId);
}

export function searchPlugins(query: string): PluginManifest[] {
  const lowerQuery = query.toLowerCase();
  return Array.from(pluginCatalog.values()).filter(
    p =>
      p.name.toLowerCase().includes(lowerQuery) ||
      p.description.toLowerCase().includes(lowerQuery) ||
      p.id.toLowerCase().includes(lowerQuery),
  );
}

export function listPlugins(): PluginManifest[] {
  return Array.from(pluginCatalog.values());
}

// ---------------------------------------------------------------------------
// Installation management
// ---------------------------------------------------------------------------

export function installPlugin(
  tenantId: string,
  manifest: PluginManifest,
  config: Record<string, unknown> = {},
): PluginInstance {
  if (!installedPlugins.has(tenantId)) {
    installedPlugins.set(tenantId, new Map());
  }

  const instance: PluginInstance = {
    manifest,
    config,
    enabled: true,
    installedAt: new Date().toISOString(),
  };

  installedPlugins.get(tenantId)!.set(manifest.id, instance);
  return instance;
}

export function uninstallPlugin(tenantId: string, pluginId: string): boolean {
  const tenantPlugins = installedPlugins.get(tenantId);
  if (!tenantPlugins) return false;
  return tenantPlugins.delete(pluginId);
}

export function getInstalledPlugins(tenantId: string): PluginInstance[] {
  const tenantPlugins = installedPlugins.get(tenantId);
  if (!tenantPlugins) return [];
  return Array.from(tenantPlugins.values());
}

export function getInstalledPlugin(tenantId: string, pluginId: string): PluginInstance | undefined {
  return installedPlugins.get(tenantId)?.get(pluginId);
}

export function enablePlugin(tenantId: string, pluginId: string): boolean {
  const instance = installedPlugins.get(tenantId)?.get(pluginId);
  if (!instance) return false;
  instance.enabled = true;
  return true;
}

export function disablePlugin(tenantId: string, pluginId: string): boolean {
  const instance = installedPlugins.get(tenantId)?.get(pluginId);
  if (!instance) return false;
  instance.enabled = false;
  return true;
}

export function updatePluginConfig(
  tenantId: string,
  pluginId: string,
  config: Record<string, unknown>,
): boolean {
  const instance = installedPlugins.get(tenantId)?.get(pluginId);
  if (!instance) return false;
  instance.config = { ...instance.config, ...config };
  return true;
}

// ---------------------------------------------------------------------------
// Hook system
// ---------------------------------------------------------------------------

export function registerHook<T>(hook: PluginHook<T>): void {
  const hooks = hookRegistry.get(hook.hook) ?? [];
  hooks.push(hook as PluginHook);
  hooks.sort((a, b) => a.priority - b.priority);
  hookRegistry.set(hook.hook, hooks);
}

/**
 * Execute all hooks for a given hook name, passing data through each handler
 * in priority order (pipeline pattern).
 */
export async function executeHooks<T>(
  hookName: string,
  context: PluginContext,
  data: T,
): Promise<T> {
  const hooks = hookRegistry.get(hookName);
  if (!hooks || hooks.length === 0) return data;

  let result = data;
  for (const hook of hooks) {
    // Only execute if plugin is installed and enabled for this tenant
    const instance = getInstalledPlugin(context.tenantId, hook.pluginId);
    if (!instance || !instance.enabled) continue;

    const handler = hook.handler as (ctx: PluginContext, d: T) => Promise<T>;
    result = await handler({ ...context, config: instance.config }, result);
  }

  return result;
}

/**
 * Clear all registries (mainly for testing).
 */
export function clearPluginRegistry(): void {
  pluginCatalog.clear();
  installedPlugins.clear();
  hookRegistry.clear();
}

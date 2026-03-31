// ---------------------------------------------------------------------------
// Plugin Types — type definitions for the plugin marketplace system
// ---------------------------------------------------------------------------

export type PluginLifecycle = 'install' | 'enable' | 'disable' | 'uninstall' | 'configure';

export interface PluginManifest {
  /** Unique plugin identifier (e.g., 'nexuszero/google-analytics') */
  id: string;
  /** Display name */
  name: string;
  /** Plugin version (semver) */
  version: string;
  /** Plugin description */
  description: string;
  /** Plugin author */
  author: string;

  /** Which agent types this plugin extends */
  agentTypes: string[];

  /** Capabilities this plugin provides */
  capabilities: PluginCapability[];

  /** Configuration schema (JSON Schema format) */
  configSchema?: Record<string, unknown>;

  /** Required platform version */
  minPlatformVersion?: string;

  /** Required plan tier */
  requiredTier?: 'launchpad' | 'growth' | 'enterprise';
}

export type PluginCapability =
  | 'data_source'      // Provides new data sources (e.g., analytics connector)
  | 'tool'             // Adds new tools to agents
  | 'signal_handler'   // Handles inter-agent signals
  | 'report_widget'    // Adds dashboard widgets
  | 'task_type'        // Adds new task types to agents
  | 'integration';     // External service integration

export interface PluginInstance {
  manifest: PluginManifest;
  /** Tenant-specific configuration */
  config: Record<string, unknown>;
  /** Whether the plugin is currently active */
  enabled: boolean;
  /** Installation timestamp */
  installedAt: string;
}

export interface PluginHook<T = unknown> {
  pluginId: string;
  hook: string;
  handler: (context: PluginContext, data: T) => Promise<T>;
  priority: number;
}

export interface PluginContext {
  tenantId: string;
  agentType: string;
  config: Record<string, unknown>;
}

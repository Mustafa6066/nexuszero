/** Types of agents in the swarm */
export type AgentType = 'seo' | 'ad' | 'data-nexus' | 'creative' | 'aeo' | 'compatibility';

/** Agent operational status */
export type AgentStatus = 'idle' | 'processing' | 'paused' | 'error' | 'offline';

/** Task priority levels */
export type TaskPriority = 'critical' | 'high' | 'medium' | 'low';

/** Task lifecycle states */
export type TaskStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled' | 'retrying';

export interface Agent {
  id: string;
  tenantId: string;
  type: AgentType;
  status: AgentStatus;
  lastHeartbeat: Date | null;
  currentTaskId: string | null;
  tasksCompleted: number;
  tasksFailed: number;
  avgProcessingTimeMs: number;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface AgentTask {
  id: string;
  tenantId: string;
  agentType: AgentType;
  taskType: string;
  status: TaskStatus;
  priority: TaskPriority;
  payload: Record<string, unknown>;
  result: Record<string, unknown> | null;
  error: string | null;
  retryCount: number;
  maxRetries: number;
  scheduledAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
}

export interface AgentHeartbeat {
  agentType: AgentType;
  tenantId: string;
  status: AgentStatus;
  currentTaskId: string | null;
  memoryUsageMb: number;
  uptime: number;
  timestamp: Date;
}

export interface AgentSignal {
  sourceAgent: AgentType;
  targetAgent: AgentType | 'broadcast';
  tenantId: string;
  signalType: string;
  payload: Record<string, unknown>;
  confidence: number;
  timestamp: Date;
}

/** Classification result from the orchestrator */
export interface TaskClassification {
  agentType: AgentType;
  taskType: string;
  priority: TaskPriority;
  estimatedDurationMs: number;
  requiresApproval: boolean;
  dependsOn: string[];
}

/** DAG node for complex objectives */
export interface TaskGraphNode {
  id: string;
  taskType: string;
  agentType: AgentType;
  dependsOn: string[];
  status: TaskStatus;
  payload: Record<string, unknown>;
}

export interface TaskGraph {
  id: string;
  tenantId: string;
  objective: string;
  nodes: TaskGraphNode[];
  createdAt: Date;
  completedAt: Date | null;
}

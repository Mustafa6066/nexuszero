import type { AssistantToolName, ReportType } from './tier.js';

/** Roles in a conversation */
export type AssistantRole = 'user' | 'assistant';

/** Types of streamed events from the assistant API */
export type AssistantEventType = 'text' | 'tool_call' | 'error' | 'done';

/** UI context sent with every assistant message */
export interface UIContext {
  currentPage: string;
  selectedDateRange?: { start: string; end: string };
  activeFilters?: Record<string, string>;
  visibleDataSummary?: string;
}

/** A single tool invocation by the assistant */
export interface ToolCall {
  id: string;
  tool: AssistantToolName;
  args: Record<string, unknown>;
  result?: unknown;
}

/** A streamed event from the assistant SSE endpoint */
export type AssistantStreamEvent =
  | { type: 'text'; content: string }
  | { type: 'tool_call'; toolCall: ToolCall }
  | { type: 'error'; message: string }
  | { type: 'done' };

/** A single message in the conversation */
export interface AssistantMessage {
  id: string;
  sessionId: string;
  role: AssistantRole;
  content: string;
  toolCalls: ToolCall[];
  uiContext?: UIContext;
  createdAt: string;
}

/** Request body for the chat endpoint */
export interface AssistantChatRequest {
  message: string;
  sessionId?: string;
  uiContext: UIContext;
}

/** Chart display data for inline rendering */
export interface InlineChartData {
  chartType: 'line' | 'bar' | 'pie' | 'area';
  title: string;
  data: Array<Record<string, unknown>>;
  xKey: string;
  yKeys: string[];
  colors?: string[];
}

/** Table display data for inline rendering */
export interface InlineTableData {
  columns: Array<{ key: string; label: string }>;
  rows: Array<Record<string, unknown>>;
}

/** Alert display data */
export interface InlineAlert {
  message: string;
  type: 'info' | 'warning' | 'success' | 'error';
}

/** Upgrade prompt data */
export interface UpgradePromptData {
  feature: string;
  requiredTier: string;
  description?: string;
}

/** Suggestion chip for quick actions */
export interface SuggestionChip {
  label: string;
  message: string;
  icon?: string;
}

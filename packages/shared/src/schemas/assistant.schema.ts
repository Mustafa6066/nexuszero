import { z } from 'zod';

/** Validate the UI context sent with each assistant message */
export const uiContextSchema = z.object({
  currentPage: z.string().min(1).max(200),
  selectedDateRange: z.object({
    start: z.string(),
    end: z.string(),
  }).optional(),
  activeFilters: z.record(z.string()).optional(),
  visibleDataSummary: z.string().max(500).optional(),
});

/** Validate the assistant chat request body */
export const assistantChatSchema = z.object({
  message: z.string().min(1).max(4000),
  sessionId: z.string().uuid().optional(),
  uiContext: uiContextSchema,
});

export type AssistantChatInput = z.infer<typeof assistantChatSchema>;

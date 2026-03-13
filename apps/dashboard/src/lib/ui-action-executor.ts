/** Minimal router interface matching Next.js useRouter() */
interface AppRouterInstance {
  push(href: string): void;
  replace(href: string): void;
  refresh(): void;
  back(): void;
  forward(): void;
  prefetch(href: string): void;
}
import type { ToolCallData } from './assistant-store';

/**
 * Executes UI tool calls received from the NexusAI assistant.
 * Maps tool names to actual UI actions (navigation, modals, etc.)
 */
export class UIActionExecutor {
  private router: AppRouterInstance;

  constructor(router: AppRouterInstance) {
    this.router = router;
  }

  async execute(toolCall: ToolCallData): Promise<void> {
    const { tool, args } = toolCall;

    switch (tool) {
      case 'navigate': {
        const page = args.page as string;
        if (page?.startsWith('/dashboard')) {
          this.router.push(page);
        }
        break;
      }
      case 'setDateRange': {
        // Dispatch a custom event that analytics components listen for
        window.dispatchEvent(new CustomEvent('nexus:daterange', {
          detail: { start: args.start, end: args.end },
        }));
        break;
      }
      case 'setFilter': {
        window.dispatchEvent(new CustomEvent('nexus:filter', {
          detail: { key: args.key, value: args.value },
        }));
        break;
      }
      case 'openModal': {
        window.dispatchEvent(new CustomEvent('nexus:modal:open', {
          detail: { modalId: args.modalId, data: args.data },
        }));
        break;
      }
      case 'closeModal': {
        window.dispatchEvent(new CustomEvent('nexus:modal:close'));
        break;
      }
      case 'showAlert': {
        window.dispatchEvent(new CustomEvent('nexus:alert', {
          detail: { message: args.message, type: args.type },
        }));
        break;
      }
      case 'connectIntegration': {
        this.router.push(`/dashboard/integrations?connect=${args.platform}`);
        break;
      }
      // showChart, showTable, showCreativePreview, showUpgradePrompt
      // are rendered inline in the chat via toolCalls on the message —
      // no UI action needed beyond what the chat component handles.
      default:
        break;
    }
  }
}

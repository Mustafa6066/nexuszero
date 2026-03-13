'use client';

import { Bot, User } from 'lucide-react';
import type { ChatMessage, ToolCallData } from '@/lib/assistant-store';
import { InlineChart } from './inline-chart';
import { InlineTable } from './inline-table';
import { UpgradePrompt } from './upgrade-prompt';
import { ActionCard } from './action-card';

interface ChatMessageBubbleProps {
  message: ChatMessage;
}

/** Single message bubble with markdown text + inline tool-call widgets */
export function ChatMessageBubble({ message }: ChatMessageBubbleProps) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex gap-3 px-4 py-3 ${isUser ? 'justify-end' : ''}`}>
      {!isUser && (
        <div className="shrink-0 w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600
          flex items-center justify-center mt-0.5">
          <Bot className="w-4 h-4 text-white" />
        </div>
      )}
      <div className={`max-w-[85%] space-y-1 ${isUser ? 'order-first' : ''}`}>
        {/* Text content */}
        {message.content && (
          <div className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
            isUser
              ? 'bg-indigo-500 text-white rounded-br-md ml-auto'
              : 'bg-secondary/60 text-foreground rounded-bl-md'
          }`}>
            <MarkdownContent text={message.content} />
          </div>
        )}

        {/* Inline tool-call widgets */}
        {message.toolCalls.map((tc) => (
          <ToolCallWidget key={tc.id} toolCall={tc} />
        ))}
      </div>
      {isUser && (
        <div className="shrink-0 w-7 h-7 rounded-full bg-secondary flex items-center justify-center mt-0.5">
          <User className="w-4 h-4 text-muted-foreground" />
        </div>
      )}
    </div>
  );
}

/** Renders inline widget for a tool call */
function ToolCallWidget({ toolCall }: { toolCall: ToolCallData }) {
  const { tool, args } = toolCall;

  switch (tool) {
    case 'showChart':
      return (
        <InlineChart
          chartType={(args.chartType as string) ?? 'bar'}
          title={(args.title as string) ?? 'Chart'}
          data={(args.data as Array<Record<string, unknown>>) ?? []}
          xKey={(args.xKey as string) ?? 'name'}
          yKeys={(args.yKeys as string[]) ?? ['value']}
          colors={args.colors as string[] | undefined}
        />
      );
    case 'showTable':
      return (
        <InlineTable
          columns={(args.columns as Array<{ key: string; label: string }>) ?? []}
          rows={(args.rows as Array<Record<string, unknown>>) ?? []}
        />
      );
    case 'showUpgradePrompt':
      return (
        <UpgradePrompt
          feature={(args.feature as string) ?? 'this feature'}
          requiredTier={(args.requiredTier as string) ?? 'Growth'}
          description={args.description as string | undefined}
        />
      );
    // Action tools render as compact action cards
    case 'navigate':
    case 'setDateRange':
    case 'setFilter':
    case 'createCampaign':
    case 'generateCreative':
    case 'pauseCampaign':
    case 'resumeCampaign':
    case 'adjustBudget':
    case 'triggerSeoAudit':
    case 'triggerAeoScan':
    case 'generateReport':
    case 'connectIntegration':
    case 'reconnectIntegration':
      return <ActionCard tool={tool} args={args} result={toolCall.result} />;
    default:
      return null;
  }
}

/** Simple markdown-ish renderer (bold, italic, code, lists) */
function MarkdownContent({ text }: { text: string }) {
  const lines = text.split('\n');

  return (
    <div className="space-y-1.5">
      {lines.map((line, i) => {
        if (!line.trim()) return <div key={i} className="h-1" />;

        // Headings
        if (line.startsWith('### ')) return <p key={i} className="font-semibold text-sm mt-2">{processInline(line.slice(4))}</p>;
        if (line.startsWith('## ')) return <p key={i} className="font-bold text-sm mt-2">{processInline(line.slice(3))}</p>;

        // Numbered list
        const numMatch = line.match(/^(\d+)\.\s+(.+)/);
        if (numMatch) {
          return (
            <div key={i} className="flex gap-2 pl-1">
              <span className="text-muted-foreground shrink-0">{numMatch[1]}.</span>
              <span>{processInline(numMatch[2])}</span>
            </div>
          );
        }

        // Bullet list
        if (line.startsWith('- ') || line.startsWith('• ')) {
          return (
            <div key={i} className="flex gap-2 pl-1">
              <span className="text-muted-foreground shrink-0">•</span>
              <span>{processInline(line.slice(2))}</span>
            </div>
          );
        }

        return <p key={i}>{processInline(line)}</p>;
      })}
    </div>
  );
}

function processInline(text: string): React.ReactNode {
  // Process **bold**, *italic*, `code`
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    // Bold
    const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
    // Code
    const codeMatch = remaining.match(/`(.+?)`/);

    // Find earliest match
    const matches = [
      boldMatch ? { type: 'bold', index: boldMatch.index!, full: boldMatch[0], inner: boldMatch[1] } : null,
      codeMatch ? { type: 'code', index: codeMatch.index!, full: codeMatch[0], inner: codeMatch[1] } : null,
    ].filter(Boolean).sort((a, b) => a!.index - b!.index);

    if (matches.length === 0) {
      parts.push(remaining);
      break;
    }

    const match = matches[0]!;
    if (match.index > 0) {
      parts.push(remaining.slice(0, match.index));
    }

    if (match.type === 'bold') {
      parts.push(<strong key={key++} className="font-semibold">{match.inner}</strong>);
    } else if (match.type === 'code') {
      parts.push(<code key={key++} className="px-1 py-0.5 rounded bg-secondary text-xs font-mono">{match.inner}</code>);
    }

    remaining = remaining.slice(match.index + match.full.length);
  }

  return <>{parts}</>;
}

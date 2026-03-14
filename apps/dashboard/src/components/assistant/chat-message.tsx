'use client';

import { User } from 'lucide-react';
import type { ChatMessage, ToolCallData } from '@/lib/assistant-store';
import { NexusIcon } from './nexus-icon';
import { InlineChart } from './inline-chart';
import { InlineTable } from './inline-table';
import { UpgradePrompt } from './upgrade-prompt';
import { ActionCard } from './action-card';

interface ChatMessageBubbleProps {
  message: ChatMessage;
}

const ARABIC_SCRIPT_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/u;

function containsArabicScript(text: string): boolean {
  return ARABIC_SCRIPT_RE.test(text);
}

/** Single message bubble with markdown text + inline tool-call widgets */
export function ChatMessageBubble({ message }: ChatMessageBubbleProps) {
  const isUser = message.role === 'user';
  const isRtl = containsArabicScript(message.content);
  const label = isUser
    ? (isRtl ? 'طلب المستخدم' : 'User Objective')
    : (isRtl ? 'تحليل NexusAI' : 'NexusAI Analysis');
  const sublabel = isUser
    ? (isRtl ? 'إدخال مباشر' : 'Direct Input')
    : (isRtl ? 'سياق حي + استدلال' : 'Live Context + Reasoning');

  return (
    <div className={`flex gap-2 px-3 py-3 msg-enter sm:gap-3 sm:px-4 ${isUser ? 'justify-end' : ''}`}>
      {!isUser && (
        <div className="mt-6 flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl border border-primary/15 bg-[linear-gradient(145deg,hsl(var(--primary)/0.15),transparent)] shadow-[0_12px_30px_hsl(var(--primary)/0.08)]">
          <NexusIcon size={14} className="text-primary" />
        </div>
      )}
      <div className={`max-w-[94%] space-y-2 sm:max-w-[88%] ${isUser ? 'order-first' : ''}`}>
        <div className={`flex items-center gap-2 px-1 ${isUser ? 'justify-end' : 'justify-start'} ${isRtl ? 'text-right' : 'text-left'}`} dir={isRtl ? 'rtl' : 'ltr'}>
          {!isUser && <span className="h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_12px_hsl(var(--primary)/0.8)]" />}
          <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground/60">{label}</span>
          <span className="text-[10px] text-muted-foreground/40">{sublabel}</span>
        </div>

        {message.content && (
          <div className={`rounded-[1.45rem] px-4 py-3 text-sm leading-relaxed shadow-[0_14px_36px_hsl(var(--background)/0.16)] ${
            isUser
              ? 'ml-auto border border-border/20 bg-[linear-gradient(180deg,hsl(var(--background)/0.78),hsl(var(--secondary)/0.65))] text-foreground/90 rounded-br-md'
              : 'border border-primary/12 bg-[linear-gradient(180deg,hsl(var(--card)/0.92),hsl(var(--secondary)/0.55))] text-foreground/92 rounded-bl-md'
          } ${isRtl ? 'text-right' : 'text-left'}`} dir={isRtl ? 'rtl' : 'ltr'}>
            <MarkdownContent text={message.content} />
          </div>
        )}

        {message.toolCalls.map((tc) => (
          <ToolCallWidget key={tc.id} toolCall={tc} />
        ))}
      </div>
      {isUser && (
        <div className="mt-6 flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl border border-border/20 bg-background/55">
          <User className="w-3.5 h-3.5 text-muted-foreground" />
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
  const isRtl = containsArabicScript(text);
  const lines = text.split('\n');

  return (
    <div
      dir={isRtl ? 'rtl' : 'ltr'}
      className={`space-y-2 break-words ${isRtl ? 'text-right' : 'text-left'}`}
      style={{ unicodeBidi: 'plaintext' }}
    >
      {lines.map((line, i) => {
        if (!line.trim()) return <div key={i} className="h-1" />;

        // Headings
        if (line.startsWith('### ')) return <p key={i} className="mt-2 text-sm font-semibold tracking-[0.01em]">{processInline(line.slice(4))}</p>;
        if (line.startsWith('## ')) return <p key={i} className="mt-2 text-sm font-bold tracking-[0.01em]">{processInline(line.slice(3))}</p>;

        // Numbered list
        const numMatch = line.match(/^([0-9\u0660-\u0669]+)[\.)]\s+(.+)/);
        if (numMatch) {
          return (
            <div key={i} className={`flex gap-2 rounded-xl bg-background/30 px-2 py-1 ${isRtl ? 'flex-row-reverse text-right' : ''}`}>
              <span className="text-muted-foreground shrink-0">{numMatch[1]}.</span>
              <span>{processInline(numMatch[2])}</span>
            </div>
          );
        }

        // Bullet list
        const bulletMatch = line.match(/^([-•*])\s+(.+)/);
        if (bulletMatch) {
          return (
            <div key={i} className={`flex gap-2 rounded-xl bg-background/30 px-2 py-1 ${isRtl ? 'flex-row-reverse text-right' : ''}`}>
              <span className="text-muted-foreground shrink-0">•</span>
              <span>{processInline(bulletMatch[2])}</span>
            </div>
          );
        }

        return <p key={i} className="leading-7 text-[0.96rem] text-foreground/88">{processInline(line)}</p>;
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
      parts.push(<code key={key++} className="rounded-md border border-border/20 bg-background/60 px-1.5 py-0.5 text-xs font-mono">{match.inner}</code>);
    }

    remaining = remaining.slice(match.index + match.full.length);
  }

  return <>{parts}</>;
}

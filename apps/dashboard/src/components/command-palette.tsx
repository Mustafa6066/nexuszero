'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAssistantActions } from '@/hooks/use-assistant';
import { useLang } from '@/app/providers';
import {
  Search, LayoutDashboard, Megaphone, Bot, BarChart3, Palette,
  Globe, Plug, Webhook, Settings, Zap, Plus, Play, Pause, ScanSearch, FileText,
  ArrowRight, Command,
} from 'lucide-react';

interface CommandItem {
  id: string;
  label: string;
  description?: string;
  icon: typeof Search;
  action: () => void;
  category: 'navigation' | 'action' | 'ai';
  keywords?: string[];
}

export function CommandPalette() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { open, sendMessage } = useAssistantActions();
  const { t } = useLang();

  const close = useCallback(() => {
    setIsOpen(false);
    setQuery('');
    setSelectedIndex(0);
  }, []);

  // Keyboard shortcut: Cmd+K / Ctrl+K and ? for shortcuts overlay
  const [showShortcuts, setShowShortcuts] = useState(false);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen((prev: boolean) => !prev);
      }
      if (e.key === 'Escape') {
        if (showShortcuts) {
          setShowShortcuts(false);
          return;
        }
        close();
      }
      // ? key (only when not typing in an input)
      if (e.key === '?' && !isOpen && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        setShowShortcuts((prev) => !prev);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [close, isOpen, showShortcuts]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      const timeoutId = window.setTimeout(() => inputRef.current?.focus(), 50);
      return () => window.clearTimeout(timeoutId);
    }
  }, [isOpen]);

  const navigate = useCallback((path: string) => {
    router.push(path);
    close();
  }, [router, close]);

  const askAI = useCallback((message: string) => {
    open();
    close();
    void sendMessage(message);
  }, [open, close, sendMessage]);

  const commands: CommandItem[] = useMemo(() => [
    // Navigation
    { id: 'nav-overview', label: t.commandPalette.navOverview, icon: LayoutDashboard, action: () => navigate('/dashboard'), category: 'navigation', keywords: ['home', 'command center'] },
    { id: 'nav-campaigns', label: t.commandPalette.navCampaigns, icon: Megaphone, action: () => navigate('/dashboard/campaigns'), category: 'navigation', keywords: ['ads', 'ppc'] },
    { id: 'nav-agents', label: t.commandPalette.navAgents, icon: Bot, action: () => navigate('/dashboard/agents'), category: 'navigation', keywords: ['swarm', 'seo', 'ad'] },
    { id: 'nav-analytics', label: t.commandPalette.navAnalytics, icon: BarChart3, action: () => navigate('/dashboard/analytics'), category: 'navigation', keywords: ['data', 'metrics', 'revenue'] },
    { id: 'nav-creatives', label: t.commandPalette.navCreatives, icon: Palette, action: () => navigate('/dashboard/creatives'), category: 'navigation', keywords: ['design', 'assets'] },
    { id: 'nav-aeo', label: t.commandPalette.navAeo, icon: Globe, action: () => navigate('/dashboard/aeo'), category: 'navigation', keywords: ['citations', 'chatgpt', 'perplexity'] },
    { id: 'nav-integrations', label: t.commandPalette.navIntegrations, icon: Plug, action: () => navigate('/dashboard/integrations'), category: 'navigation', keywords: ['connect', 'platforms'] },
    { id: 'nav-webhooks', label: t.commandPalette.navWebhooks, icon: Webhook, action: () => navigate('/dashboard/webhooks'), category: 'navigation', keywords: ['events', 'endpoints'] },
    { id: 'nav-settings', label: t.commandPalette.navSettings, icon: Settings, action: () => navigate('/dashboard/settings'), category: 'navigation', keywords: ['account', 'subscription', 'profile'] },
    // Actions
    { id: 'act-create-campaign', label: t.commandPalette.actCreateCampaign, description: t.commandPalette.actCreateCampaignDesc, icon: Plus, action: () => navigate('/dashboard/campaigns?create=true'), category: 'action', keywords: ['new', 'launch'] },
    { id: 'act-seo-audit', label: t.commandPalette.actSeoAudit, description: t.commandPalette.actSeoAuditDesc, icon: ScanSearch, action: () => askAI('Run a quick SEO audit'), category: 'action', keywords: ['scan', 'technical'] },
    { id: 'act-aeo-scan', label: t.commandPalette.actAeoScan, description: t.commandPalette.actAeoScanDesc, icon: Globe, action: () => askAI('Run an AEO citation scan'), category: 'action', keywords: ['citations', 'visibility'] },
    { id: 'act-report', label: t.commandPalette.actReport, description: t.commandPalette.actReportDesc, icon: FileText, action: () => askAI('Generate an executive summary report'), category: 'action', keywords: ['export', 'pdf'] },
    // AI shortcuts
    { id: 'ai-performance', label: t.commandPalette.aiPerformance, icon: Bot, action: () => askAI('How are my campaigns performing this month?'), category: 'ai', keywords: ['performance', 'stats'] },
    { id: 'ai-agents', label: t.commandPalette.aiAgents, icon: Bot, action: () => askAI("What's the status of all my agents?"), category: 'ai', keywords: ['health', 'fleet'] },
    { id: 'ai-seo', label: t.commandPalette.aiSeo, icon: Bot, action: () => askAI('Give me an overview of my SEO performance'), category: 'ai', keywords: ['organic', 'rankings'] },
    { id: 'ai-recommend', label: t.commandPalette.aiRecommend, icon: Bot, action: () => askAI('Based on my current data, what actions do you recommend?'), category: 'ai', keywords: ['suggest', 'next steps'] },
  ], [askAI, navigate, t]);

  // Filter commands
  const filtered = useMemo(() => {
    if (!query.trim()) return commands;
    const q = query.toLowerCase();
    return commands.filter((cmd) => (
      cmd.label.toLowerCase().includes(q) ||
      cmd.description?.toLowerCase().includes(q) ||
      cmd.keywords?.some((k) => k.includes(q))
    ));
  }, [commands, query]);

  // Group by category
  const grouped = useMemo(() => ({
    navigation: filtered.filter((c: CommandItem) => c.category === 'navigation'),
    action: filtered.filter((c: CommandItem) => c.category === 'action'),
    ai: filtered.filter((c: CommandItem) => c.category === 'ai'),
  }), [filtered]);

  const flatFiltered = useMemo(() => [...grouped.navigation, ...grouped.action, ...grouped.ai], [grouped]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    function handleNav(e: KeyboardEvent) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev: number) => Math.min(prev + 1, flatFiltered.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev: number) => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        flatFiltered[selectedIndex]?.action();
      }
    }

    window.addEventListener('keydown', handleNav);
    return () => window.removeEventListener('keydown', handleNav);
  }, [isOpen, selectedIndex, flatFiltered]);

  // Reset selection on query change
  useEffect(() => { setSelectedIndex(0); }, [query]);

  // Scroll selected into view
  useEffect(() => {
    if (listRef.current) {
      const selected = listRef.current.querySelector('[data-selected="true"]');
      selected?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  if (!isOpen && !showShortcuts) return null;

  if (showShortcuts) {
    const shortcuts = [
      { keys: ['⌘', 'K'], label: t.commandPalette.openCommandPalette },
      { keys: ['?'], label: t.commandPalette.showKeyboardShortcuts },
      { keys: ['G', 'D'], label: t.commandPalette.goToDashboard },
      { keys: ['G', 'C'], label: t.commandPalette.goToCampaigns },
      { keys: ['G', 'A'], label: t.commandPalette.goToAgents },
      { keys: ['G', 'N'], label: t.commandPalette.goToAnalytics },
      { keys: ['G', 'I'], label: t.commandPalette.goToIntegrations },
      { keys: ['G', 'S'], label: t.commandPalette.goToSettings },
      { keys: ['Esc'], label: t.commandPalette.closeOverlay },
    ];
    return (
      <>
        <div className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm" onClick={() => setShowShortcuts(false)} />
        <div className="fixed inset-0 z-[61] flex items-center justify-center px-4">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-card/95 backdrop-blur-xl shadow-2xl overflow-hidden animate-fade-in">
            <div className="flex items-center justify-between px-5 py-3 border-b border-border">
              <h3 className="text-sm font-semibold">{t.commandPalette.keyboardShortcuts}</h3>
              <kbd className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">?</kbd>
            </div>
            <div className="p-4 space-y-2.5">
              {shortcuts.map((s) => (
                <div key={s.label} className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{s.label}</span>
                  <div className="flex items-center gap-1">
                    {s.keys.map((k) => (
                      <kbd key={k} className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground min-w-[20px] text-center">
                        {k}
                      </kbd>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </>
    );
  }

  let flatIndex = -1;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm" onClick={close} />

      {/* Palette */}
      <div className="fixed inset-0 z-[61] flex items-start justify-center pt-[15vh] px-4">
        <div className="w-full max-w-lg rounded-2xl border border-border bg-card/95 backdrop-blur-xl shadow-2xl shadow-black/40 overflow-hidden animate-fade-in">
          {/* Search input */}
          <div className="flex items-center gap-3 px-4 border-b border-border">
            <Search size={16} className="text-muted-foreground shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e: { target: { value: string } }) => setQuery(e.target.value)}
              placeholder={t.commandPalette.placeholder}
              className="flex-1 bg-transparent py-3.5 text-sm outline-none placeholder:text-muted-foreground"
            />
            <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded bg-secondary px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
              ESC
            </kbd>
          </div>

          {/* Results */}
          <div ref={listRef} className="max-h-80 overflow-y-auto py-2">
            {flatFiltered.length === 0 && (
              <div className="px-4 py-8 text-center">
                <p className="text-sm text-muted-foreground">{t.commandPalette.noResults} &ldquo;{query}&rdquo;</p>
                <p className="text-xs text-muted-foreground/60 mt-1">{t.commandPalette.tryDifferent}</p>
              </div>
            )}

            {grouped.navigation.length > 0 && (
              <div>
                <p className="px-4 py-1.5 text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">{t.commandPalette.navigate}</p>
                {grouped.navigation.map((cmd: CommandItem) => {
                  flatIndex++;
                  const idx = flatIndex;
                  const Icon = cmd.icon;
                  return (
                    <button
                      key={cmd.id}
                      data-selected={idx === selectedIndex}
                      onClick={cmd.action}
                      className={`w-full flex items-center gap-3 px-4 py-2 text-sm transition-colors ${
                        idx === selectedIndex ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-secondary/60'
                      }`}
                    >
                      <Icon size={15} className="shrink-0 text-muted-foreground" />
                      <span className="flex-1 text-left">{cmd.label}</span>
                      {idx === selectedIndex && <ArrowRight size={12} className="text-primary" />}
                    </button>
                  );
                })}
              </div>
            )}

            {grouped.action.length > 0 && (
              <div>
                <p className="px-4 py-1.5 text-[10px] font-semibold tracking-widest text-muted-foreground uppercase mt-1">{t.commandPalette.quickActions}</p>
                {grouped.action.map((cmd: CommandItem) => {
                  flatIndex++;
                  const idx = flatIndex;
                  const Icon = cmd.icon;
                  return (
                    <button
                      key={cmd.id}
                      data-selected={idx === selectedIndex}
                      onClick={cmd.action}
                      className={`w-full flex items-center gap-3 px-4 py-2 text-sm transition-colors ${
                        idx === selectedIndex ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-secondary/60'
                      }`}
                    >
                      <Icon size={15} className="shrink-0 text-muted-foreground" />
                      <div className="flex-1 text-left">
                        <span>{cmd.label}</span>
                        {cmd.description && <span className="ml-2 text-xs text-muted-foreground">{cmd.description}</span>}
                      </div>
                      <Zap size={10} className="text-amber-400" />
                    </button>
                  );
                })}
              </div>
            )}

            {grouped.ai.length > 0 && (
              <div>
                <p className="px-4 py-1.5 text-[10px] font-semibold tracking-widest text-muted-foreground uppercase mt-1">{t.commandPalette.askNexusAI}</p>
                {grouped.ai.map((cmd: CommandItem) => {
                  flatIndex++;
                  const idx = flatIndex;
                  const Icon = cmd.icon;
                  return (
                    <button
                      key={cmd.id}
                      data-selected={idx === selectedIndex}
                      onClick={cmd.action}
                      className={`w-full flex items-center gap-3 px-4 py-2 text-sm transition-colors ${
                        idx === selectedIndex ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-secondary/60'
                      }`}
                    >
                      <Icon size={15} className="shrink-0 text-primary" />
                      <span className="flex-1 text-left">{cmd.label}</span>
                      <ArrowRight size={10} className="text-muted-foreground" />
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-border px-4 py-2 text-[10px] text-muted-foreground">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1"><kbd className="rounded bg-secondary px-1 py-0.5 font-mono">↑↓</kbd> {t.commandPalette.footerNavigate}</span>
              <span className="flex items-center gap-1"><kbd className="rounded bg-secondary px-1 py-0.5 font-mono">↵</kbd> {t.commandPalette.footerSelect}</span>
              <span className="flex items-center gap-1"><kbd className="rounded bg-secondary px-1 py-0.5 font-mono">Esc</kbd> {t.commandPalette.footerClose}</span>
            </div>
            <div className="flex items-center gap-1">
              <Command size={10} /> <span>K</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

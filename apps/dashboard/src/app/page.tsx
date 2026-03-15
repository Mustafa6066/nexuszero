import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { LandingThemeToggle } from '@/components/landing-theme-toggle';

/* ── Inline SVG icons (Lucide-style, no external dep) ── */
function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
    </svg>
  );
}
function TargetIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" />
    </svg>
  );
}
function BrainIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.46 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z" />
      <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.46 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z" />
    </svg>
  );
}
function BarChartIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" /><line x1="2" y1="20" x2="22" y2="20" />
    </svg>
  );
}
function ZapIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}
function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}
function NetworkIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="16" y="16" width="6" height="6" rx="1" /><rect x="2" y="16" width="6" height="6" rx="1" />
      <rect x="9" y="2" width="6" height="6" rx="1" />
      <path d="M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3" /><path d="M12 12V8" />
    </svg>
  );
}
function ActivityIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  );
}
function LinkIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}
function TrendingUpIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" />
    </svg>
  );
}
function ArrowRightIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
    </svg>
  );
}
function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
function CpuIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <rect x="9" y="9" width="6" height="6" />
      <line x1="9" y1="1" x2="9" y2="4" /><line x1="15" y1="1" x2="15" y2="4" />
      <line x1="9" y1="20" x2="9" y2="23" /><line x1="15" y1="20" x2="15" y2="23" />
      <line x1="20" y1="9" x2="23" y2="9" /><line x1="20" y1="14" x2="23" y2="14" />
      <line x1="1" y1="9" x2="4" y2="9" /><line x1="1" y1="14" x2="4" y2="14" />
    </svg>
  );
}

const INTEGRATIONS = [
  'Google Analytics', 'Google Ads', 'Meta Ads', 'TikTok Ads', 'HubSpot',
  'Salesforce', 'Shopify', 'Semrush', 'Ahrefs', 'Klaviyo',
  'LinkedIn Ads', 'Google Search Console', 'Stripe', 'Intercom', 'Notion',
];

const AGENTS = [
  {
    Icon: SearchIcon,
    name: 'SEO Agent',
    tag: 'Search Intelligence',
    desc: 'Monitors rankings, identifies keyword gaps, generates optimized content briefs, and submits sitemaps autonomously — 24 hours a day.',
    metrics: ['+47 average ranking positions gained', 'Real-time SERP tracking across 1M+ keywords'],
    iconBg: 'bg-primary/10 border-primary/20',
    iconColor: 'text-primary',
    gradient: 'from-primary/6',
    badge: 'text-primary bg-primary/10 border-primary/20',
  },
  {
    Icon: TargetIcon,
    name: 'Ad Agent',
    tag: 'Paid Media Optimizer',
    desc: 'Allocates budget across Google, Meta, and TikTok in real time. Kills underperformers, scales winners, and writes copy without waiting for approval.',
    metrics: ['3.2× average ROAS across managed accounts', 'Bid optimization every 15 minutes'],
    iconBg: 'bg-green-500/10 border-green-500/20',
    iconColor: 'text-green-500',
    gradient: 'from-green-500/6',
    badge: 'text-green-500 bg-green-500/10 border-green-500/20',
  },
  {
    Icon: BrainIcon,
    name: 'AEO Agent',
    tag: 'Answer Engine Optimization',
    desc: 'Ensures your brand appears in AI-generated answers across ChatGPT, Perplexity, and Gemini. Structures data for LLM consumption at scale.',
    metrics: ['68% AI citation rate across tracked queries', 'Schema injection and FAQ auto-generation'],
    iconBg: 'bg-emerald-500/10 border-emerald-500/20',
    iconColor: 'text-emerald-500',
    gradient: 'from-emerald-500/6',
    badge: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20',
  },
  {
    Icon: BarChartIcon,
    name: 'Data Nexus',
    tag: 'Intelligence Hub',
    desc: 'Aggregates signals from all agents into a unified analytics layer. Generates predictive insights and anomaly alerts in sub-second response times.',
    metrics: ['Sub-2-second end-to-end data latency', 'ClickHouse + Kafka real-time pipeline'],
    iconBg: 'bg-amber-500/10 border-amber-500/20',
    iconColor: 'text-amber-400',
    gradient: 'from-amber-500/6',
    badge: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  },
];

const CAPABILITIES = [
  {
    Icon: ZapIcon,
    title: 'Real-time orchestration',
    desc: 'Task graph with dependency resolution executes jobs across the swarm in parallel with sub-second scheduling.',
    color: 'text-primary',
    bg: 'bg-primary/10',
  },
  {
    Icon: ActivityIcon,
    title: 'Self-healing loops',
    desc: 'Agents detect execution failures, apply exponential backoff, and escalate through webhook channels automatically.',
    color: 'text-green-500',
    bg: 'bg-green-500/10',
  },
  {
    Icon: ShieldIcon,
    title: 'Multi-tenant isolation',
    desc: 'Row-level security enforced at the database layer ensures complete data isolation across every account.',
    color: 'text-emerald-500',
    bg: 'bg-emerald-500/10',
  },
  {
    Icon: NetworkIcon,
    title: 'Event-driven pipeline',
    desc: 'Kafka streams synchronize agents for zero-latency cross-signal analysis and coordinated execution.',
    color: 'text-lime-500',
    bg: 'bg-lime-500/10',
  },
  {
    Icon: LinkIcon,
    title: 'Webhook automation',
    desc: 'Push agent decisions to Slack, Notion, HubSpot, or any HTTP endpoint — fully configurable event routing.',
    color: 'text-green-600',
    bg: 'bg-green-600/10',
  },
  {
    Icon: TrendingUpIcon,
    title: 'Predictive analytics',
    desc: 'ClickHouse columnar engine powers sub-second queries over billions of agent events for forward-looking intelligence.',
    color: 'text-amber-400',
    bg: 'bg-amber-500/10',
  },
];

const STEPS = [
  {
    step: '01',
    title: 'Connect your data sources',
    desc: 'Link Google Ads, Meta, Search Console, HubSpot, and your analytics stack in minutes through one-click OAuth flows. No engineering work required.',
  },
  {
    step: '02',
    title: 'The orchestrator builds the task graph',
    desc: 'The central orchestrator maps dependencies, assigns priority levels, and schedules tasks across the swarm based on real-time signals and business rules.',
  },
  {
    step: '03',
    title: 'Agents execute without intervention',
    desc: 'Agents act — adjusting bids, publishing content briefs, updating structured data, detecting anomalies — continuously and without waiting for your input.',
  },
  {
    step: '04',
    title: 'Monitor, override, and tune',
    desc: 'Every decision is logged and visible. Set spend guardrails, override any agent decision, and tune autonomous behavior with fine-grained controls.',
  },
];

export default async function LandingPage() {
  const session = await getServerSession(authOptions);
  if (session) redirect('/dashboard');

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">

      {/* ── Background ── */}
      <div className="fixed inset-0 bg-dots opacity-[0.45] pointer-events-none" />
      <div className="fixed inset-0 aurora-bg pointer-events-none" />

      {/* ── Nav ── */}
      <nav className="fixed top-5 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-3xl flex items-center justify-between gap-3 px-4 sm:px-5 py-2.5 glass-nav rounded-full">
        <span className="font-bold text-sm tracking-tight gradient-text shrink-0">NexusZero</span>
        <div className="hidden md:flex items-center gap-5 text-xs text-muted-foreground">
          <a href="#agents" className="hover:text-foreground transition-colors">Agents</a>
          <a href="#platform" className="hover:text-foreground transition-colors">Platform</a>
          <a href="#how" className="hover:text-foreground transition-colors">How it works</a>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <LandingThemeToggle />
          <Link
            href="/login"
            className="rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-white hover:bg-primary/85 transition-colors whitespace-nowrap"
          >
            Sign in
          </Link>
        </div>
      </nav>

      {/* ══════════════════════════════════════════
          HERO
      ══════════════════════════════════════════ */}
      <section className="relative flex flex-col items-center justify-center min-h-screen px-4 sm:px-6 pt-24 sm:pt-28 pb-16 sm:pb-20 text-center">

        {/* Ambient orbs */}
        <div className="absolute orb-indigo top-0 -left-60 opacity-60 pointer-events-none" />
        <div className="absolute orb-sky bottom-10 -right-48 opacity-55 pointer-events-none" />

        {/* Status pill */}
        <div className="animate-fade-in mb-8 inline-flex items-center gap-2.5 rounded-full border border-border/50 bg-card/50 backdrop-blur-sm px-4 py-2 text-xs text-muted-foreground">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
          </span>
          System online — 4 agents processing in real time
        </div>

        {/* Headline */}
        <h1
          className="animate-fade-up text-3xl sm:text-5xl md:text-6xl lg:text-[4.5rem] font-bold tracking-tight leading-[1.08] mb-6 max-w-4xl"
          style={{ animationDelay: '0.1s', opacity: 0 }}
        >
          The autonomous<br />
          <span className="gradient-text">marketing intelligence</span><br />
          layer
        </h1>

        <p
          className="animate-fade-up text-base sm:text-lg text-muted-foreground max-w-xl leading-relaxed mb-10"
          style={{ animationDelay: '0.2s', opacity: 0 }}
        >
          AI agent swarms that run your SEO, paid media, answer engine optimization,
          and analytics — continuously, without you lifting a finger.
        </p>

        {/* CTAs */}
        <div
          className="animate-fade-up flex flex-col sm:flex-row items-center gap-3 mb-14"
          style={{ animationDelay: '0.3s', opacity: 0 }}
        >
          <Link
            href="/login"
            className="btn-glow rounded-full bg-primary px-8 py-3.5 text-sm font-semibold text-white hover:bg-primary/85 hover:scale-105 transition-all inline-flex items-center gap-2"
          >
            Enter Command Center
            <ArrowRightIcon className="w-4 h-4" />
          </Link>
          <a
            href="#agents"
            className="rounded-full border border-border/60 bg-card/30 backdrop-blur-sm px-8 py-3.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:border-border transition-all"
          >
            Explore the platform
          </a>
        </div>

        {/* Stats row */}
        <div
          className="animate-fade-up grid grid-cols-2 sm:grid-cols-4 gap-px bg-border/30 rounded-2xl overflow-hidden border border-border/30 max-w-2xl w-full mb-14"
          style={{ animationDelay: '0.38s', opacity: 0 }}
        >
          {[
            { label: 'Campaigns optimized', value: '2,847' },
            { label: 'Ad spend managed',    value: '$1.2M' },
            { label: 'SERP positions',       value: '94.3%' },
            { label: 'Tasks automated',      value: '48,291' },
          ].map(({ label, value }) => (
            <div key={label} className="bg-card/70 backdrop-blur-sm px-3 sm:px-5 py-4 sm:py-5 text-center">
              <p className="text-lg sm:text-2xl font-bold tabular-nums">{value}</p>
              <p className="text-[10px] sm:text-[11px] text-muted-foreground mt-1">{label}</p>
            </div>
          ))}
        </div>

        {/* ── Dashboard mockup ── */}
        <div
          className="animate-fade-up mx-auto max-w-4xl w-full relative"
          style={{ animationDelay: '0.48s', opacity: 0 }}
        >
          {/* Browser chrome */}
          <div className="rounded-2xl border border-border/60 bg-card/80 backdrop-blur-xl shadow-2xl shadow-black/30 overflow-hidden">
            {/* Titlebar */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border/40 bg-secondary/20">
              <div className="flex gap-1.5">
                <div className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
                <div className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
                <div className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
              </div>
              <div className="flex-1 flex justify-center">
                <div className="rounded border border-border/40 bg-background/40 px-10 py-1 text-xs tabular-nums text-muted-foreground/70">
                  nexuszero.io/dashboard
                </div>
              </div>
            </div>
            {/* Dashboard grid */}
            <div className="p-3 sm:p-4 grid grid-cols-4 sm:grid-cols-12 gap-2 sm:gap-3">
              {/* Stat cards */}
              {[
                { label: 'Active Campaigns', val: '142',    sub: '+12 today',       c: 'text-primary' },
                { label: 'Avg ROAS',          val: '3.2×',  sub: '+0.4 vs last wk', c: 'text-green-500' },
                { label: 'SERP Coverage',     val: '94.3%', sub: '+3.1 pts',        c: 'text-emerald-500' },
                { label: 'Tasks Automated',   val: '8,291', sub: '+847 today',      c: 'text-emerald-400' },
              ].map(s => (
                <div key={s.label} className="col-span-1 sm:col-span-3 rounded-xl border border-border/40 bg-background/30 p-2 sm:p-3">
                  <p className="text-[8px] sm:text-[10px] text-muted-foreground leading-tight">{s.label}</p>
                  <p className="text-sm sm:text-lg font-bold mt-0.5 sm:mt-1 tabular-nums">{s.val}</p>
                  <p className={`text-[8px] sm:text-[10px] mt-0.5 sm:mt-1 ${s.c}`}>{s.sub}</p>
                </div>
              ))}
              {/* Agent status */}
              <div className="col-span-2 sm:col-span-5 rounded-xl border border-border/40 bg-background/30 p-2.5 sm:p-3.5">
                <p className="text-[8px] sm:text-[9px] font-semibold text-muted-foreground uppercase tracking-widest mb-2 sm:mb-3">Agent Status</p>
                {[
                  { name: 'SEO Agent',  tasks: '23 active', dot: 'bg-primary' },
                  { name: 'Ad Agent',   tasks: '12 active', dot: 'bg-green-500' },
                  { name: 'AEO Agent',  tasks: '8 active',  dot: 'bg-emerald-500' },
                  { name: 'Data Nexus', tasks: '47 events', dot: 'bg-amber-400' },
                ].map(a => (
                  <div key={a.name} className="flex items-center gap-1.5 sm:gap-2 py-1 sm:py-1.5 border-b border-border/30 last:border-0">
                    <div className={`h-1.5 w-1.5 rounded-full ${a.dot} flex-shrink-0`} />
                    <span className="text-[9px] sm:text-[11px] flex-1 text-foreground/70 truncate">{a.name}</span>
                    <span className="text-[8px] sm:text-[10px] text-muted-foreground whitespace-nowrap">{a.tasks}</span>
                    <span className="text-[8px] sm:text-[9px] text-emerald-400 font-medium">Running</span>
                  </div>
                ))}
              </div>
              {/* Mini chart */}
              <div className="col-span-2 sm:col-span-7 rounded-xl border border-border/40 bg-background/30 p-2.5 sm:p-3.5">
                <p className="text-[8px] sm:text-[9px] font-semibold text-muted-foreground uppercase tracking-widest mb-2 sm:mb-3">Revenue Impact (30 days)</p>
                <div className="flex items-end gap-[3px] h-14">
                  {[35,48,42,65,58,72,68,80,76,88,82,95,90,100,94,97,85,92,96,100].map((h, i) => (
                    <div
                      key={i}
                      className="flex-1 rounded-sm"
                      style={{
                        height: `${h}%`,
                        background: i >= 17
                          ? 'hsl(142 72% 42% / 0.85)'
                          : 'hsl(142 72% 42% / 0.22)',
                      }}
                    />
                  ))}
                </div>
                <div className="flex justify-between mt-2">
                  <span className="text-[9px] text-muted-foreground">30 days ago</span>
                  <span className="text-[9px] text-muted-foreground">Today</span>
                </div>
              </div>
            </div>
          </div>
          {/* Glow reflection */}
          <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 w-2/3 h-14 bg-primary/10 blur-3xl rounded-full pointer-events-none" />
        </div>
      </section>

      {/* ══════════════════════════════════════════
          INTEGRATION MARQUEE
      ══════════════════════════════════════════ */}
      <div className="relative py-8 border-y border-border/40 bg-secondary/10 overflow-hidden">
        {/* Edge fades */}
        <div className="absolute left-0 top-0 bottom-0 w-28 bg-gradient-to-r from-background to-transparent z-10 pointer-events-none" />
        <div className="absolute right-0 top-0 bottom-0 w-28 bg-gradient-to-l from-background to-transparent z-10 pointer-events-none" />
        <p className="text-center text-[10px] font-semibold tracking-widest text-muted-foreground uppercase mb-5">
          Integrates with your entire stack
        </p>
        <div className="flex overflow-hidden">
          <div className="marquee-track">
            {[...INTEGRATIONS, ...INTEGRATIONS].map((name, i) => (
              <span key={i} className="inline-flex items-center text-sm text-muted-foreground/55 font-medium">
                <CpuIcon className="w-3.5 h-3.5 mr-2 text-muted-foreground/30 flex-shrink-0" />
                {name}
                <span className="mx-5 text-border/60">·</span>
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════
          AGENTS
      ══════════════════════════════════════════ */}
      <section id="agents" className="relative px-4 sm:px-6 py-16 sm:py-28 max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <p className="text-xs font-semibold tracking-widest text-primary uppercase mb-3">The Agent Swarm</p>
          <h2 className="text-3xl sm:text-5xl font-bold tracking-tight">Four specialists. One mission.</h2>
          <p className="text-muted-foreground mt-4 max-w-lg mx-auto text-sm leading-relaxed">
            Each agent is purpose-built for its domain. Together they form an autonomous intelligence
            that learns, adapts, and executes — continuously.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {AGENTS.map((agent) => (
            <div
              key={agent.name}
              className={`relative rounded-3xl border border-border/60 bg-gradient-to-br ${agent.gradient} via-transparent to-transparent p-8 overflow-hidden hover:border-border transition-all duration-300 hover:-translate-y-0.5`}
            >
              {/* Live dot */}
              <div className="absolute top-5 right-5 flex items-center gap-1.5">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
                </span>
                <span className="text-[10px] text-muted-foreground">live</span>
              </div>

              {/* Icon */}
              <div className={`w-11 h-11 rounded-xl border ${agent.iconBg} flex items-center justify-center mb-5`}>
                <agent.Icon className={`w-5 h-5 ${agent.iconColor}`} />
              </div>

              {/* Tag pill */}
              <p className={`inline-flex text-[10px] font-semibold tracking-wide uppercase border rounded-full px-2.5 py-1 mb-3 ${agent.badge}`}>
                {agent.tag}
              </p>

              <h3 className="text-lg font-bold mb-3">{agent.name}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed mb-6">{agent.desc}</p>

              <div className="space-y-2.5 border-t border-border/40 pt-5">
                {agent.metrics.map(m => (
                  <div key={m} className="flex items-start gap-2.5 text-xs text-muted-foreground">
                    <CheckIcon className="w-3.5 h-3.5 text-primary flex-shrink-0 mt-0.5" />
                    {m}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ══════════════════════════════════════════
          CAPABILITIES
      ══════════════════════════════════════════ */}
      <section id="platform" className="relative px-4 sm:px-6 py-16 sm:py-28 border-y border-border/40 bg-secondary/10">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-xs font-semibold tracking-widest text-primary uppercase mb-3">Platform Architecture</p>
            <h2 className="text-3xl sm:text-5xl font-bold tracking-tight">Built for production autonomy</h2>
            <p className="text-muted-foreground mt-4 max-w-md mx-auto text-sm leading-relaxed">
              Enterprise-grade infrastructure that makes autonomous operation safe, observable, and controllable.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {CAPABILITIES.map(({ Icon, title, desc, color, bg }) => (
              <div key={title} className="rounded-2xl border border-border/50 bg-card/50 p-6 hover:border-border/80 hover:bg-card/70 transition-all">
                <div className={`w-9 h-9 rounded-xl ${bg} flex items-center justify-center mb-4`}>
                  <Icon className={`w-4 h-4 ${color}`} />
                </div>
                <h3 className="text-sm font-semibold mb-2">{title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════
          HOW IT WORKS
      ══════════════════════════════════════════ */}
      <section id="how" className="relative px-4 sm:px-6 py-16 sm:py-28 max-w-4xl mx-auto">
        <div className="text-center mb-16">
          <p className="text-xs font-semibold tracking-widest text-primary uppercase mb-3">Workflow</p>
          <h2 className="text-3xl sm:text-5xl font-bold tracking-tight">From signal to autonomous action</h2>
          <p className="text-muted-foreground mt-4 text-sm max-w-md mx-auto leading-relaxed">
            Getting from zero to a fully operational agent swarm takes minutes, not months.
          </p>
        </div>

        <div className="relative">
          {/* Vertical connector */}
          <div className="absolute left-6 top-6 bottom-6 w-px bg-gradient-to-b from-primary/50 via-primary/15 to-transparent pointer-events-none" />

          <div className="space-y-8">
            {STEPS.map(({ step, title, desc }) => (
              <div key={step} className="flex gap-7 items-start group">
                <div className="flex-shrink-0 w-12 h-12 rounded-2xl border border-border bg-card flex items-center justify-center text-xs font-mono font-bold text-primary z-10 group-hover:border-primary/40 group-hover:bg-primary/5 transition-all">
                  {step}
                </div>
                <div className="pt-2.5">
                  <h3 className="font-semibold mb-1.5">{title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════
          CTA
      ══════════════════════════════════════════ */}
      <section className="relative px-4 sm:px-6 py-16 sm:py-28 text-center">
        <div className="max-w-2xl mx-auto">
          {/* Gradient border card */}
          <div className="relative p-px rounded-3xl bg-gradient-to-br from-primary/45 via-primary/15 to-accent/25">
            <div className="rounded-[calc(1.5rem-1px)] bg-card/90 backdrop-blur-sm px-6 sm:px-10 py-10 sm:py-14 relative overflow-hidden">
              <div className="absolute inset-0 aurora-bg opacity-35 pointer-events-none" />
              <div className="relative">
                <p className="text-xs font-semibold tracking-widest text-primary uppercase mb-4">Deploy now</p>
                <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
                  Your command center<br />
                  <span className="gradient-text">is ready to activate</span>
                </h2>
                <p className="text-muted-foreground mb-8 text-sm max-w-sm mx-auto leading-relaxed">
                  Sign in to launch your agent swarm. Connect your first data source in under five minutes.
                </p>
                <Link
                  href="/login"
                  className="btn-glow inline-flex items-center gap-2 rounded-full bg-primary px-10 py-4 text-sm font-semibold text-white hover:bg-primary/85 hover:scale-105 transition-all"
                >
                  Launch Command Center
                  <ArrowRightIcon className="w-4 h-4" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════
          FOOTER
      ══════════════════════════════════════════ */}
      <footer className="border-t border-border/40 px-4 sm:px-6 py-10 sm:py-14">
        <div className="max-w-6xl mx-auto grid grid-cols-2 sm:grid-cols-4 gap-8 sm:gap-10">

          {/* Brand */}
          <div className="col-span-2 sm:col-span-1">
            <p className="gradient-text font-bold text-sm mb-2">NexusZero</p>
            <p className="text-xs text-muted-foreground leading-relaxed mb-4">
              Autonomous AI marketing<br />intelligence platform.
            </p>
            <div className="flex items-center gap-1.5">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
              </span>
              <span className="text-[10px] text-muted-foreground">All systems operational</span>
            </div>
          </div>

          {/* Platform */}
          <div>
            <p className="text-xs font-semibold text-foreground/80 mb-3">Platform</p>
            <div className="space-y-2.5">
              {['Dashboard', 'Analytics', 'Campaigns', 'Integrations', 'Webhooks'].map(l => (
                <Link key={l} href="/login" className="block text-xs text-muted-foreground hover:text-foreground transition-colors">{l}</Link>
              ))}
            </div>
          </div>

          {/* Agents */}
          <div>
            <p className="text-xs font-semibold text-foreground/80 mb-3">Agents</p>
            <div className="space-y-2.5">
              {['SEO Agent', 'Ad Agent', 'AEO Agent', 'Data Nexus', 'Orchestrator'].map(l => (
                <p key={l} className="text-xs text-muted-foreground">{l}</p>
              ))}
            </div>
          </div>

          {/* Company */}
          <div>
            <p className="text-xs font-semibold text-foreground/80 mb-3">Company</p>
            <div className="space-y-2.5">
              {['Documentation', 'API Reference', 'Architecture', 'Status', 'Privacy Policy'].map(l => (
                <p key={l} className="text-xs text-muted-foreground">{l}</p>
              ))}
            </div>
          </div>
        </div>

        <div className="max-w-6xl mx-auto mt-10 pt-6 border-t border-border/30 flex flex-col sm:flex-row justify-between items-center gap-3">
          <p className="text-[11px] text-muted-foreground">© 2026 NexusZero. All rights reserved.</p>
          <p className="text-[11px] text-muted-foreground">Autonomous AI Marketing Intelligence</p>
        </div>
      </footer>
    </div>
  );
}


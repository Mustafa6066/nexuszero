import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';

export default async function LandingPage() {
  const session = await getServerSession(authOptions);
  if (session) redirect('/dashboard');

  return (
    <div className="min-h-screen bg-background overflow-hidden">
      {/* ── Background grid + aurora ── */}
      <div className="fixed inset-0 bg-grid opacity-40 pointer-events-none" />
      <div className="fixed inset-0 aurora-bg pointer-events-none" />

      {/* ── Floating landing nav ── */}
      <nav className="fixed top-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-6 px-6 py-3 glass-nav rounded-full shadow-lg shadow-black/20">
        <span className="font-bold text-sm tracking-tight gradient-text">NexusZero</span>
        <div className="hidden sm:flex items-center gap-5 text-sm text-muted-foreground">
          <a href="#agents" className="hover:text-foreground transition-colors">Agents</a>
          <a href="#capabilities" className="hover:text-foreground transition-colors">Capabilities</a>
          <a href="#how" className="hover:text-foreground transition-colors">How it works</a>
        </div>
        <Link
          href="/login"
          className="ml-2 rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/85 transition-colors"
        >
          Sign In
        </Link>
      </nav>

      {/* ── Hero ── */}
      <section className="relative flex flex-col items-center justify-center min-h-screen px-6 pt-24 pb-16 text-center">
        {/* Live agent status pill */}
        <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-border bg-card/60 backdrop-blur-sm px-4 py-2 text-xs text-muted-foreground animate-fade-in">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-green-400" />
          </span>
          4 AI agents running autonomously right now
        </div>

        <h1 className="animate-fade-up text-5xl sm:text-7xl font-bold tracking-tight leading-none mb-6 max-w-4xl" style={{ animationDelay: '0.1s', opacity: 0 }}>
          Marketing that<br />
          <span className="gradient-text">thinks for itself</span>
        </h1>

        <p className="animate-fade-up text-lg text-muted-foreground max-w-xl leading-relaxed mb-10" style={{ animationDelay: '0.2s', opacity: 0 }}>
          Autonomous AI agent swarms that run your SEO, ads, creatives, and answer engine
          optimization — continuously, without you lifting a finger.
        </p>

        <div className="animate-fade-up flex flex-col sm:flex-row items-center gap-3" style={{ animationDelay: '0.3s', opacity: 0 }}>
          <Link
            href="/login"
            className="rounded-full bg-primary px-8 py-3.5 text-sm font-semibold text-primary-foreground hover:bg-primary/85 transition-all hover:scale-105 shadow-lg shadow-primary/30"
          >
            Enter Command Center →
          </Link>
          <a href="#agents" className="rounded-full border border-border bg-card/50 backdrop-blur-sm px-8 py-3.5 text-sm font-medium hover:bg-secondary/80 transition-colors">
            See the agents
          </a>
        </div>

        {/* Floating metric cards */}
        <div className="animate-fade-up mt-16 grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-2xl w-full" style={{ animationDelay: '0.45s', opacity: 0 }}>
          {[
            { label: 'Campaigns optimized', value: '2,847', delta: '↑ 12% today' },
            { label: 'Ad spend managed', value: '$1.2M', delta: '↑ 8% this week' },
            { label: 'SERP positions', value: '94.3%', delta: '↑ 3.1 pts' },
            { label: 'Tasks automated', value: '48,291', delta: '↑ 847 today' },
          ].map(({ label, value, delta }) => (
            <div key={label} className="rounded-2xl border border-border bg-card/70 backdrop-blur-sm p-4 text-left hover:border-primary/30 transition-colors">
              <p className="text-xs text-muted-foreground mb-1">{label}</p>
              <p className="text-xl font-bold">{value}</p>
              <p className="text-xs text-green-400 mt-1">{delta}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Agents section ── */}
      <section id="agents" className="relative px-6 py-24 max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <p className="text-xs font-semibold tracking-widest text-primary uppercase mb-3">The Swarm</p>
          <h2 className="text-3xl sm:text-5xl font-bold tracking-tight">Four agents. One mission.</h2>
          <p className="text-muted-foreground mt-4 max-w-lg mx-auto">Each agent is a specialist. Together they form an autonomous marketing intelligence that learns, adapts, and executes.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[
            {
              icon: '🔍',
              name: 'SEO Agent',
              tag: 'Search Intelligence',
              desc: 'Monitors rankings, identifies keyword gaps, generates optimized content briefs, and submits sitemaps — fully automated, 24/7.',
              metrics: ['+47 avg positions gained', 'Real-time SERP tracking'],
              color: 'from-violet-500/10 to-transparent',
            },
            {
              icon: '📣',
              name: 'Ad Agent',
              tag: 'Paid Media Optimizer',
              desc: 'Allocates budget across Google, Meta, and TikTok in real-time. Kills underperformers, scales winners, writes ad copy autonomously.',
              metrics: ['3.2× avg ROAS', 'Bid optimization every 15 min'],
              color: 'from-cyan-500/10 to-transparent',
            },
            {
              icon: '🤖',
              name: 'AEO Agent',
              tag: 'Answer Engine Optimization',
              desc: 'Ensures your brand appears in AI-generated answers across ChatGPT, Perplexity, Gemini. Structures data for LLM consumption.',
              metrics: ['68% AI citation rate', 'Schema auto-injection'],
              color: 'from-pink-500/10 to-transparent',
            },
            {
              icon: '📊',
              name: 'Data Nexus',
              tag: 'Intelligence Hub',
              desc: 'Aggregates signals from all agents into a unified analytics layer. Generates predictive insights and anomaly alerts in real-time.',
              metrics: ['< 2s data latency', 'ClickHouse + Kafka pipeline'],
              color: 'from-amber-500/10 to-transparent',
            },
          ].map((agent) => (
            <div key={agent.name} className={`relative rounded-3xl border border-border bg-gradient-to-br ${agent.color} p-8 overflow-hidden group hover:border-primary/30 transition-all hover:-translate-y-1`}>
              <div className="absolute top-4 right-4 flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse-dot" />
                <span className="text-xs text-muted-foreground">live</span>
              </div>
              <div className="text-3xl mb-4">{agent.icon}</div>
              <p className="text-xs font-semibold tracking-widest text-primary uppercase mb-1">{agent.tag}</p>
              <h3 className="text-xl font-bold mb-3">{agent.name}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed mb-5">{agent.desc}</p>
              <div className="space-y-1.5">
                {agent.metrics.map(m => (
                  <div key={m} className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="h-1 w-1 rounded-full bg-primary/60 flex-shrink-0" />
                    {m}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Capabilities ── */}
      <section id="capabilities" className="relative px-6 py-24 bg-secondary/20">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-xs font-semibold tracking-widest text-primary uppercase mb-3">Capabilities</p>
            <h2 className="text-3xl sm:text-5xl font-bold tracking-tight">Built for autonomy</h2>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {[
              { icon: '⚡', title: 'Real-time orchestration', desc: 'Task graph with dependency resolution runs jobs in parallel across all agents.' },
              { icon: '🧠', title: 'Self-healing loops', desc: 'Agents detect failures, retry with backoff, and escalate via webhooks.' },
              { icon: '🔐', title: 'Multi-tenant isolation', desc: 'Row-level security ensures complete data isolation across accounts.' },
              { icon: '📡', title: 'Event-driven pipeline', desc: 'Kafka streams synchronize agents for zero-latency cross-signal insights.' },
              { icon: '🪝', title: 'Webhook automation', desc: 'Push agent decisions to Slack, Notion, HubSpot, or any endpoint.' },
              { icon: '📈', title: 'Predictive analytics', desc: 'ClickHouse columnar engine powers sub-second queries on billions of rows.' },
            ].map(({ icon, title, desc }) => (
              <div key={title} className="rounded-2xl border border-border bg-card/50 p-6 hover:border-primary/30 transition-colors">
                <div className="text-2xl mb-3">{icon}</div>
                <h3 className="text-sm font-semibold mb-2">{title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section id="how" className="relative px-6 py-24 max-w-4xl mx-auto">
        <div className="text-center mb-16">
          <p className="text-xs font-semibold tracking-widest text-primary uppercase mb-3">Workflow</p>
          <h2 className="text-3xl sm:text-5xl font-bold tracking-tight">From signal to action</h2>
        </div>

        <div className="space-y-6">
          {[
            { step: '01', title: 'Connect your data sources', desc: 'Link Google Ads, Meta, Google Search Console, and your analytics in minutes. One-click OAuth flows.' },
            { step: '02', title: 'Agents analyze and plan', desc: 'The orchestrator assigns tasks across the swarm based on priority, dependencies, and real-time signals.' },
            { step: '03', title: 'Autonomous execution', desc: 'Agents act — adjusting bids, publishing content, updating schemas, generating reports — without waiting for you.' },
            { step: '04', title: 'Monitor and override', desc: 'Watch everything in the command center. Override any decision or set guardrails for autonomous budgets.' },
          ].map(({ step, title, desc }) => (
            <div key={step} className="flex gap-6 items-start group">
              <div className="flex-shrink-0 w-12 h-12 rounded-2xl border border-border bg-card flex items-center justify-center text-xs font-mono font-bold text-primary group-hover:border-primary/50 transition-colors">
                {step}
              </div>
              <div className="pt-2">
                <h3 className="font-semibold mb-1">{title}</h3>
                <p className="text-sm text-muted-foreground">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="relative px-6 py-24 text-center">
        <div className="max-w-2xl mx-auto">
          <div className="rounded-3xl border border-border bg-card/60 backdrop-blur-sm p-12 relative overflow-hidden">
            <div className="absolute inset-0 aurora-bg opacity-60 pointer-events-none" />
            <div className="relative">
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
                Your agents are<br />
                <span className="gradient-text">ready to deploy</span>
              </h2>
              <p className="text-muted-foreground mb-8 text-sm max-w-sm mx-auto">
                Sign in to activate your command center. The swarm is waiting.
              </p>
              <Link
                href="/login"
                className="inline-flex rounded-full bg-primary px-10 py-4 text-sm font-semibold text-primary-foreground hover:bg-primary/85 transition-all hover:scale-105 shadow-xl shadow-primary/30"
              >
                Launch Command Center →
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-border px-6 py-8 text-center text-xs text-muted-foreground">
        <p className="gradient-text font-semibold mb-1">NexusZero</p>
        <p>Autonomous AI Marketing Intelligence Platform</p>
      </footer>
    </div>
  );
}


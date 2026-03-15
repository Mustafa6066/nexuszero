'use client';

import { useState } from 'react';
import { Card, Badge, Button } from '@/components/ui';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import {
  Search, Globe, ShieldCheck, Zap, BarChart3, Megaphone, Users,
  FileCode, ChevronDown, ChevronUp, CheckCircle2, XCircle, AlertCircle, ArrowRight,
} from 'lucide-react';
import { useLang } from '@/app/providers';

// ── Types (mirrors shared package) ────────────────────────────────────────

interface ScanCheckItem {
  category: string;
  label: string;
  status: 'detected' | 'missing' | 'partial' | 'recommended';
  detail: string;
  platform?: string;
  confidence?: number;
}

interface SeoBaseline {
  hasRobotsTxt: boolean;
  hasSitemap: boolean;
  hasMetaTitle: boolean;
  hasMetaDescription: boolean;
  hasOpenGraph: boolean;
  hasStructuredData: boolean;
  hasCanonical: boolean;
  hasHreflang: boolean;
}

interface SecurityInfo {
  hasHttps: boolean;
  redirectsToHttps: boolean;
  hasHsts: boolean;
}

interface PerformanceHints {
  serverResponseMs: number;
  hasCompression: boolean;
}

interface DetectedTech {
  platform: string;
  confidence: number;
  evidence: string;
}

interface ScanResult {
  domain: string;
  scannedUrl: string;
  scannedAt: string;
  readinessScore: number;
  detectedTech: DetectedTech[];
  seo: SeoBaseline;
  security: SecurityInfo;
  performance: PerformanceHints;
  checklist: ScanCheckItem[];
  connectablePlatforms: string[];
  missingPlatforms: string[];
  recommendedAgents: string[];
}

// ── Helpers ───────────────────────────────────────────────────────────────

const categoryIcons: Record<string, typeof Globe> = {
  analytics: BarChart3,
  advertising: Megaphone,
  crm: Users,
  cms: FileCode,
  seo: Globe,
  performance: Zap,
  security: ShieldCheck,
};

const statusConfig: Record<string, { icon: typeof CheckCircle2; color: string; badge: 'success' | 'destructive' | 'warning' | 'outline' }> = {
  detected: { icon: CheckCircle2, color: 'text-green-400', badge: 'success' },
  missing: { icon: XCircle, color: 'text-red-400', badge: 'destructive' },
  partial: { icon: AlertCircle, color: 'text-yellow-400', badge: 'warning' },
  recommended: { icon: AlertCircle, color: 'text-primary', badge: 'outline' },
};

function scoreColor(score: number): string {
  if (score >= 75) return 'text-green-400';
  if (score >= 50) return 'text-yellow-400';
  return 'text-red-400';
}

function scoreRingColor(score: number): string {
  if (score >= 75) return 'stroke-green-400';
  if (score >= 50) return 'stroke-yellow-400';
  return 'stroke-red-400';
}

// ── Score Ring Component ──────────────────────────────────────────────────

function ScoreRing({ score }: { score: number }) {
  const { t } = useLang();
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="relative w-36 h-36">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r={radius} fill="none" strokeWidth="8" className="stroke-border/30" />
        <circle
          cx="60" cy="60" r={radius} fill="none" strokeWidth="8"
          strokeDasharray={circumference} strokeDashoffset={offset}
          strokeLinecap="round"
          className={cn('transition-all duration-1000 ease-out', scoreRingColor(score))}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={cn('text-3xl font-bold', scoreColor(score))}>{score}</span>
        <span className="text-xs text-muted-foreground">{t.scannerPage.readiness}</span>
      </div>
    </div>
  );
}

// ── Main Page Component ───────────────────────────────────────────────────

export default function ScannerPage() {
  const [url, setUrl] = useState('');
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const { t } = useLang();

  const handleScan = async () => {
    if (!url.trim()) return;
    setScanning(true);
    setError(null);
    setResult(null);
    try {
      const data = await api.runPreflightScan(url.trim());
      setResult(data);
    } catch (err: any) {
      setError(err.message || 'Scan failed');
    } finally {
      setScanning(false);
    }
  };

  // Group checklist by category
  const grouped = result
    ? result.checklist.reduce<Record<string, ScanCheckItem[]>>((acc, item) => {
        (acc[item.category] ??= []).push(item);
        return acc;
      }, {})
    : {};

  const categoryLabels: Record<string, string> = {
    analytics: 'Analytics & Tracking',
    advertising: 'Advertising Pixels',
    crm: 'CRM & Lead Management',
    cms: 'Content Management',
    seo: 'SEO Fundamentals',
    performance: 'Performance',
    security: 'Security',
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">{t.scannerPage.heading}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t.scannerPage.scannerSubtitle}
        </p>
      </div>

      {/* Scan Input */}
      <Card className="p-4">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleScan()}
              placeholder={t.scannerPage.enterPlaceholder}
              className="w-full rounded-lg border border-border bg-background pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
          <Button onClick={handleScan} disabled={scanning || !url.trim()} size="md" className="w-full sm:w-auto">
            {scanning ? (
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                {t.scannerPage.scanning}
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Zap size={16} />
                {t.scannerPage.scanWebsite}
              </span>
            )}
          </Button>
        </div>
      </Card>

      {/* Error */}
      {error && (
        <Card className="border-red-500/30 bg-red-500/5 p-4">
          <p className="text-sm text-red-400">{error}</p>
        </Card>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-6 animate-in fade-in-0 slide-in-from-bottom-4 duration-500">
          {/* Score + Summary Row */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {/* Score Card */}
            <Card className="flex flex-col items-center justify-center p-5 sm:p-6">
              <ScoreRing score={result.readinessScore} />
              <p className="mt-2 text-sm text-muted-foreground">{result.domain}</p>
            </Card>

            {/* Quick Stats */}
            <Card className="space-y-3 p-5 sm:p-6">
              <h3 className="text-sm font-medium text-muted-foreground">{t.scannerPage.detectionSummary}</h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm">{t.scannerPage.technologiesDetected}</span>
                  <Badge variant="success">{result.detectedTech.length}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">{t.scannerPage.autoConnectable}</span>
                  <Badge>{result.connectablePlatforms.length}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">{t.scannerPage.needsSetup}</span>
                  <Badge variant={result.missingPlatforms.length > 3 ? 'warning' : 'outline'}>{result.missingPlatforms.length}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">{t.scannerPage.serverResponse}</span>
                  <Badge variant={result.performance.serverResponseMs < 1000 ? 'success' : 'warning'}>
                    {result.performance.serverResponseMs}ms
                  </Badge>
                </div>
              </div>
            </Card>

            {/* Recommended Agents */}
            <Card className="space-y-3 p-5 sm:p-6">
              <h3 className="text-sm font-medium text-muted-foreground">{t.scannerPage.recommendedAgents}</h3>
              <div className="space-y-2">
                {result.recommendedAgents.map((agent) => (
                  <div key={agent} className="flex items-center gap-2 text-sm">
                    <div className="h-2 w-2 rounded-full bg-primary" />
                    <span className="capitalize">{agent.replace('_', ' ')} Agent</span>
                  </div>
                ))}
              </div>
              <Button variant="outline" size="sm" className="w-full mt-2">
                <span className="flex items-center gap-1.5">
                  {t.scannerPage.deployEngine} <ArrowRight size={14} />
                </span>
              </Button>
            </Card>
          </div>

          {/* Detected Technologies */}
          {result.detectedTech.length > 0 && (
            <Card className="p-6">
              <h3 className="text-sm font-medium text-muted-foreground mb-3">{t.scannerPage.detectedTechnologies}</h3>
              <div className="flex flex-wrap gap-2">
                {result.detectedTech.map((tech) => (
                  <div
                    key={tech.platform}
                    className="flex items-center gap-2 rounded-lg border border-border/50 bg-secondary/30 px-3 py-1.5 text-xs"
                  >
                    <CheckCircle2 size={12} className="text-green-400" />
                    <span className="font-medium capitalize">{tech.platform.replace(/_/g, ' ')}</span>
                    <span className="text-muted-foreground">{Math.round(tech.confidence * 100)}%</span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Requirements Checklist */}
          <Card className="p-6">
            <h3 className="text-sm font-medium text-muted-foreground mb-4">{t.scannerPage.requirementsChecklist}</h3>
            <div className="space-y-2">
              {Object.entries(grouped).map(([category, items]) => {
                const Icon = categoryIcons[category] ?? Globe;
                const detected = items.filter((i) => i.status === 'detected').length;
                const total = items.length;
                const isExpanded = expandedCategory === category;

                return (
                  <div key={category} className="rounded-lg border border-border/40 overflow-hidden">
                    <button
                      onClick={() => setExpandedCategory(isExpanded ? null : category)}
                      className="w-full flex items-center justify-between p-3 hover:bg-secondary/30 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <Icon size={16} className="text-muted-foreground" />
                        <span className="text-sm font-medium">{categoryLabels[category] ?? category}</span>
                        <Badge variant={detected === total ? 'success' : detected > 0 ? 'warning' : 'destructive'}>
                          {detected}/{total}
                        </Badge>
                      </div>
                      {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                    {isExpanded && (
                      <div className="border-t border-border/30 p-3 space-y-2">
                        {items.map((item, idx) => {
                          const cfg = statusConfig[item.status] ?? statusConfig.missing;
                          const StatusIcon = cfg.icon;
                          return (
                            <div key={idx} className="flex items-start gap-3 py-1.5">
                              <StatusIcon size={14} className={cn('mt-0.5', cfg.color)} />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium">{item.label}</span>
                                  <Badge variant={cfg.badge}>{item.status}</Badge>
                                </div>
                                <p className="text-xs text-muted-foreground mt-0.5">{item.detail}</p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

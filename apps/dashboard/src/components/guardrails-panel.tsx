'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, Button, Badge } from '@/components/ui';
import { useLang } from '@/app/providers';
import { Shield, DollarSign, TrendingDown, Clock, AlertTriangle } from 'lucide-react';

interface Guardrails {
  maxDailySpend?: number;
  maxBidChange?: number;       // max % change per optimization
  maxCampaignsPerDay?: number;
  pauseOnRoasBelow?: number;
  requireApprovalAbove?: number; // spend threshold requiring approval
  cooldownMinutes?: number;     // min time between actions
  enabled?: boolean;
}

export function GuardrailsPanel() {
  const queryClient = useQueryClient();
  const { t } = useLang();

  const { data: guardrails, isLoading } = useQuery({
    queryKey: ['guardrails'],
    queryFn: () => api.getGuardrails() as Promise<Guardrails>,
  });

  const [form, setForm] = useState<Guardrails>({});
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (guardrails) setForm(guardrails);
  }, [guardrails]);

  const mutation = useMutation({
    mutationFn: (data: Guardrails) => api.updateGuardrails(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['guardrails'] });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    },
  });

  const update = (key: keyof Guardrails, value: number | boolean) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  if (isLoading) {
    return (
      <Card className="animate-pulse">
        <div className="h-4 w-1/3 rounded bg-secondary" />
        <div className="mt-4 space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-10 rounded bg-secondary" />)}
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Shield size={16} className="text-primary" />
          <h3 className="text-sm font-semibold">{t.guardrails?.heading || 'Agent Guardrails'}</h3>
        </div>
        <div className="flex items-center gap-2">
          {saved && <Badge variant="success">{t.common.success}</Badge>}
          <label className="relative inline-flex cursor-pointer items-center">
            <input
              type="checkbox"
              checked={form.enabled ?? true}
              onChange={(e) => update('enabled', e.target.checked)}
              className="peer sr-only"
            />
            <div className="h-6 w-11 rounded-full bg-secondary peer-checked:bg-primary transition-colors after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all peer-checked:after:translate-x-full" />
          </label>
        </div>
      </div>

      <p className="text-xs text-muted-foreground mb-4">
        {t.guardrails?.description || 'Set safety limits that agents cannot exceed. These constraints protect your campaigns and budget.'}
      </p>

      <div className="space-y-4">
        {/* Max Daily Spend */}
        <GuardrailInput
          icon={<DollarSign size={14} />}
          label={t.guardrails?.maxDailySpend || 'Max Daily Spend'}
          description={t.guardrails?.maxDailySpendDesc || 'Maximum total daily ad spend across all campaigns'}
          value={form.maxDailySpend}
          onChange={(v) => update('maxDailySpend', v)}
          suffix="USD"
          min={0}
          step={100}
        />

        {/* Max Bid Change */}
        <GuardrailInput
          icon={<TrendingDown size={14} />}
          label={t.guardrails?.maxBidChange || 'Max Bid Change (%)'}
          description={t.guardrails?.maxBidChangeDesc || 'Maximum percentage change per bid optimization'}
          value={form.maxBidChange}
          onChange={(v) => update('maxBidChange', v)}
          suffix="%"
          min={1}
          max={100}
          step={5}
        />

        {/* Pause on ROAS Below */}
        <GuardrailInput
          icon={<AlertTriangle size={14} />}
          label={t.guardrails?.pauseOnRoas || 'Pause Campaign if ROAS Below'}
          description={t.guardrails?.pauseOnRoasDesc || 'Automatically pause campaigns that drop below this ROAS threshold'}
          value={form.pauseOnRoasBelow}
          onChange={(v) => update('pauseOnRoasBelow', v)}
          suffix="x"
          min={0}
          step={0.1}
        />

        {/* Require Approval Above */}
        <GuardrailInput
          icon={<Shield size={14} />}
          label={t.guardrails?.requireApproval || 'Require Approval Above'}
          description={t.guardrails?.requireApprovalDesc || 'Actions affecting spend above this amount need manual approval'}
          value={form.requireApprovalAbove}
          onChange={(v) => update('requireApprovalAbove', v)}
          suffix="USD"
          min={0}
          step={50}
        />

        {/* Cooldown Between Actions */}
        <GuardrailInput
          icon={<Clock size={14} />}
          label={t.guardrails?.cooldown || 'Cooldown Between Actions'}
          description={t.guardrails?.cooldownDesc || 'Minimum minutes between agent optimizations on the same campaign'}
          value={form.cooldownMinutes}
          onChange={(v) => update('cooldownMinutes', v)}
          suffix="min"
          min={0}
          step={5}
        />
      </div>

      <div className="flex justify-end mt-4">
        <Button
          size="sm"
          onClick={() => mutation.mutate(form)}
          disabled={mutation.isPending}
        >
          {mutation.isPending ? t.common.loading : t.guardrails?.save || 'Save Guardrails'}
        </Button>
      </div>
    </Card>
  );
}

function GuardrailInput({
  icon,
  label,
  description,
  value,
  onChange,
  suffix,
  min,
  max,
  step,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  value: number | undefined;
  onChange: (v: number) => void;
  suffix: string;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border p-3">
      <div className="mt-0.5 text-muted-foreground shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <input
          type="number"
          value={value ?? ''}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          min={min}
          max={max}
          step={step}
          placeholder="—"
          className="w-20 rounded-lg border border-border bg-secondary px-2 py-1.5 text-sm text-end focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <span className="text-xs text-muted-foreground">{suffix}</span>
      </div>
    </div>
  );
}

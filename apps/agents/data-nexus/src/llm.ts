import Anthropic from '@anthropic-ai/sdk';
import { retry, CircuitBreaker } from '@nexuszero/shared';

const anthropicBreaker = new CircuitBreaker({
  failureThreshold: 5,
  resetTimeoutMs: 60_000,
  halfOpenRequests: 2,
});

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

export async function llmAnalyze(prompt: string, systemPrompt?: string): Promise<string> {
  return anthropicBreaker.execute(async () => {
    return retry(async () => {
      const anthropic = getClient();
      const response = await anthropic.messages.create({
        model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514',
        max_tokens: 8192,
        system: systemPrompt || 'You are an expert data analyst and marketing intelligence specialist. Provide precise, actionable analysis in JSON format.',
        messages: [{ role: 'user', content: prompt }],
      });

      const textBlock = response.content.find(b => b.type === 'text');
      return textBlock?.text || '';
    }, { maxRetries: 3, baseDelayMs: 1000 });
  });
}

export async function llmDailyInsights(metrics: {
  totalSpend: number;
  totalRevenue: number;
  totalImpressions: number;
  totalClicks: number;
  totalConversions: number;
  avgRoas: number;
  avgCtr: number;
  avgCpa: number;
  channelBreakdown: Record<string, { spend: number; revenue: number; conversions: number }>;
  campaignSummaries: Array<{ name: string; spend: number; revenue: number; roas: number }>;
}): Promise<{ summary: string; keyFindings: string[]; recommendations: string[]; alerts: string[] }> {
  const prompt = `Analyze today's marketing performance and provide daily insights:

Metrics:
- Total Spend: $${metrics.totalSpend.toFixed(2)}
- Total Revenue: $${metrics.totalRevenue.toFixed(2)}
- Total Impressions: ${metrics.totalImpressions}
- Total Clicks: ${metrics.totalClicks}
- Total Conversions: ${metrics.totalConversions}
- Average ROAS: ${metrics.avgRoas.toFixed(2)}x
- Average CTR: ${(metrics.avgCtr * 100).toFixed(2)}%
- Average CPA: $${metrics.avgCpa.toFixed(2)}

Channel Breakdown:
${JSON.stringify(metrics.channelBreakdown, null, 2)}

Top Campaigns:
${metrics.campaignSummaries.map(c => `  - ${c.name}: Spend $${c.spend.toFixed(2)}, Revenue $${c.revenue.toFixed(2)}, ROAS ${c.roas.toFixed(2)}x`).join('\n')}

Return JSON with: summary (string), keyFindings (string[]), recommendations (string[]), alerts (string[])`;

  const result = await llmAnalyze(prompt);
  try {
    const parsed = JSON.parse(result.replace(/```json?\n?/g, '').replace(/```/g, ''));
    return {
      summary: parsed.summary || '',
      keyFindings: parsed.keyFindings || [],
      recommendations: parsed.recommendations || [],
      alerts: parsed.alerts || [],
    };
  } catch {
    return { summary: 'Analysis unavailable', keyFindings: [], recommendations: [], alerts: [] };
  }
}

export async function llmInvestigateAnomaly(anomaly: {
  metric: string;
  value: number;
  expectedValue: number;
  zScore: number;
  context: Record<string, unknown>;
}): Promise<{ rootCause: string; severity: string; impact: string; recommendation: string }> {
  const prompt = `Investigate the following marketing anomaly:

Metric: ${anomaly.metric}
Observed Value: ${anomaly.value}
Expected Value: ${anomaly.expectedValue}
Z-Score: ${anomaly.zScore.toFixed(2)} (${anomaly.zScore > 0 ? 'above' : 'below'} normal)
Context: ${JSON.stringify(anomaly.context, null, 2)}

Determine the likely root cause, severity (low/medium/high/critical), estimated impact, and recommended action.
Return JSON with: rootCause (string), severity (string), impact (string), recommendation (string)`;

  const result = await llmAnalyze(prompt);
  try {
    const parsed = JSON.parse(result.replace(/```json?\n?/g, '').replace(/```/g, ''));
    return {
      rootCause: parsed.rootCause || 'Unknown',
      severity: parsed.severity || 'medium',
      impact: parsed.impact || 'Unknown',
      recommendation: parsed.recommendation || 'Monitor closely',
    };
  } catch {
    return { rootCause: 'Analysis failed', severity: 'medium', impact: 'Unknown', recommendation: 'Investigate manually' };
  }
}

export async function llmForecastAnalysis(historicalData: {
  metric: string;
  dataPoints: Array<{ date: string; value: number }>;
  trendSlope: number;
  rSquared: number;
}): Promise<{ narrative: string; confidence: string; risks: string[]; opportunities: string[] }> {
  const prompt = `Analyze the following forecast data and provide strategic context:

Metric: ${historicalData.metric}
Data Points (last ${historicalData.dataPoints.length} periods):
${historicalData.dataPoints.slice(-10).map(d => `  ${d.date}: ${d.value}`).join('\n')}
Trend: slope=${historicalData.trendSlope.toFixed(4)}, R²=${historicalData.rSquared.toFixed(3)}

Provide strategic analysis of this forecast trend.
Return JSON with: narrative (string), confidence (high/medium/low), risks (string[]), opportunities (string[])`;

  const result = await llmAnalyze(prompt);
  try {
    const parsed = JSON.parse(result.replace(/```json?\n?/g, '').replace(/```/g, ''));
    return {
      narrative: parsed.narrative || '',
      confidence: parsed.confidence || 'medium',
      risks: parsed.risks || [],
      opportunities: parsed.opportunities || [],
    };
  } catch {
    return { narrative: 'Forecast analysis unavailable', confidence: 'low', risks: [], opportunities: [] };
  }
}

export async function llmGenerateCompoundInsights(aggregatedData: {
  industryPatterns: Record<string, unknown>;
  commonTrends: Array<{ trend: string; count: number }>;
  performanceBenchmarks: Record<string, number>;
  sampleSize: number;
}): Promise<Array<{ type: string; title: string; description: string; confidence: number; recommendations: string[] }>> {
  const prompt = `Analyze cross-tenant anonymized marketing data to generate compound insights:

Industry Patterns: ${JSON.stringify(aggregatedData.industryPatterns, null, 2)}
Common Trends: ${aggregatedData.commonTrends.map(t => `  ${t.trend}: x${t.count}`).join('\n')}
Performance Benchmarks: ${JSON.stringify(aggregatedData.performanceBenchmarks, null, 2)}
Sample Size: ${aggregatedData.sampleSize} tenants

Generate actionable compound insights that apply across clients.
Return a JSON array of objects with: type (performance_pattern|audience_behavior|creative_trend|channel_correlation|seasonal_pattern), title, description, confidence (0-1), recommendations (string[])`;

  const result = await llmAnalyze(prompt);
  try {
    const parsed = JSON.parse(result.replace(/```json?\n?/g, '').replace(/```/g, ''));
    return Array.isArray(parsed) ? parsed : parsed.insights || [];
  } catch {
    return [];
  }
}

export async function llmPredictPerformance(creative: {
  type: string;
  platform: string;
  content: Record<string, unknown>;
  historicalPerformance: Array<{ type: string; ctr: number; conversionRate: number }>;
}): Promise<{ predictedCtr: number; predictedConversionRate: number; confidence: number; reasoning: string }> {
  const prompt = `Predict the performance of the following creative asset:

Type: ${creative.type}
Platform: ${creative.platform}
Content: ${JSON.stringify(creative.content, null, 2)}

Historical Performance for Similar Creatives:
${creative.historicalPerformance.map(h => `  ${h.type}: CTR=${(h.ctr * 100).toFixed(2)}%, Conv=${(h.conversionRate * 100).toFixed(2)}%`).join('\n')}

Predict the expected CTR and conversion rate for this creative.
Return JSON with: predictedCtr (decimal), predictedConversionRate (decimal), confidence (0-1), reasoning (string)`;

  const result = await llmAnalyze(prompt);
  try {
    const parsed = JSON.parse(result.replace(/```json?\n?/g, '').replace(/```/g, ''));
    return {
      predictedCtr: parsed.predictedCtr || 0,
      predictedConversionRate: parsed.predictedConversionRate || 0,
      confidence: parsed.confidence || 0.5,
      reasoning: parsed.reasoning || '',
    };
  } catch {
    return { predictedCtr: 0, predictedConversionRate: 0, confidence: 0, reasoning: 'Prediction unavailable' };
  }
}

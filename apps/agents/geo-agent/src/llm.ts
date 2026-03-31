import { routedCompletion, ModelPreset } from '@nexuszero/llm-router';

export async function llmAnalyzeLocalKeywords(
  keywords: string[],
  city: string,
  service: string,
): Promise<{ clustered: Array<{ keyword: string; intent: string; priority: 'high' | 'medium' | 'low' }> }> {
  const systemPrompt = 'You are a local SEO expert. Analyze keywords for local search intent and prioritization. Return only JSON.';
  const prompt = `Analyze these local keywords for "${service}" in "${city}":

Keywords: ${keywords.map(k => `"${k}"`).join(', ')}

Cluster and prioritize by local search intent.
Return JSON: { "clustered": [{ "keyword": "<keyword>", "intent": "<informational|transactional|navigational>", "priority": "<high|medium|low>" }] }`;

  const raw = await routedCompletion({
    model: ModelPreset.FAST_ANALYSIS,
    messages: [{ role: 'user', content: prompt }],
    systemPrompt,
    maxTokens: 1024,
    temperature: 0.3,
  });

  try {
    return JSON.parse(raw.replace(/```json?\n?/g, '').replace(/```/g, '').trim()) as { clustered: Array<{ keyword: string; intent: string; priority: 'high' | 'medium' | 'low' }> };
  } catch {
    return { clustered: keywords.map(k => ({ keyword: k, intent: 'transactional', priority: 'medium' as const })) };
  }
}

export async function llmGenerateLocalSchema(location: {
  name: string;
  city: string;
  country: string;
  region?: string | null;
  postalCode?: string | null;
  lat?: number | null;
  lng?: number | null;
}): Promise<Record<string, unknown>> {
  const systemPrompt = 'You are a schema.org expert. Generate valid JSON-LD LocalBusiness markup. Return only the JSON-LD object.';
  const prompt = `Generate JSON-LD LocalBusiness schema for:

Business Name: ${location.name}
City: ${location.city}
Region: ${location.region || 'N/A'}
Country: ${location.country}
Postal Code: ${location.postalCode || 'N/A'}
${location.lat && location.lng ? `Coordinates: ${location.lat}, ${location.lng}` : ''}

Return only the JSON-LD object with @context, @type LocalBusiness, name, address, geo.`;

  const raw = await routedCompletion({
    model: ModelPreset.FAST_ANALYSIS,
    messages: [{ role: 'user', content: prompt }],
    systemPrompt,
    maxTokens: 1024,
    temperature: 0.2,
  });

  try {
    return JSON.parse(raw.replace(/```json?\n?/g, '').replace(/```/g, '').trim()) as Record<string, unknown>;
  } catch {
    return {
      '@context': 'https://schema.org',
      '@type': 'LocalBusiness',
      name: location.name,
      address: {
        '@type': 'PostalAddress',
        addressLocality: location.city,
        addressRegion: location.region,
        addressCountry: location.country,
        postalCode: location.postalCode,
      },
    };
  }
}

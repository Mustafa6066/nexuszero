'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, Badge, Button, MetricCard } from '@/components/ui';
import { TierGateOverlay } from '@/components/tier-gate-overlay';
import { TrendingUp, TrendingDown, Minus, MapPin } from 'lucide-react';

export default function GeoPage() {
  const queryClient = useQueryClient();
  const [showAddLocation, setShowAddLocation] = useState(false);
  const [locationForm, setLocationForm] = useState({
    name: '', country: '', city: '', region: '', postalCode: '',
  });
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);

  const { data: locations = [], isLoading: locationsLoading } = useQuery({
    queryKey: ['geo', 'locations'],
    queryFn: () => api.getGeoLocations(),
  });

  const { data: rankings = [], isLoading: rankingsLoading } = useQuery({
    queryKey: ['geo', 'rankings', selectedLocationId],
    queryFn: () => api.getGeoRankings(selectedLocationId ? { locationId: selectedLocationId } : undefined),
  });

  const { data: citations = [], isLoading: citationsLoading } = useQuery({
    queryKey: ['geo', 'citations'],
    queryFn: () => api.getGeoCitations(),
  });

  const scanMutation = useMutation({
    mutationFn: () => api.triggerGeoScan(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['geo'] }),
  });

  const addLocationMutation = useMutation({
    mutationFn: (data: Record<string, string>) => api.addGeoLocation(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['geo', 'locations'] });
      setShowAddLocation(false);
      setLocationForm({ name: '', country: '', city: '', region: '', postalCode: '' });
    },
  });

  const deleteLocationMutation = useMutation({
    mutationFn: (id: string) => api.deleteGeoLocation(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['geo', 'locations'] });
      if (selectedLocationId) setSelectedLocationId(null);
    },
  });

  const consistentCitations = citations.filter((c: any) => c.napConsistent).length;
  const inconsistentCitations = citations.filter((c: any) => !c.napConsistent).length;
  const avgRank = rankings.length
    ? (rankings.reduce((s: number, r: any) => s + (r.rank ?? 0), 0) / rankings.length).toFixed(1)
    : '-';

  const locationRankSummary = useMemo(() => {
    if (!locations.length || !rankings.length) return [];
    return locations.map((loc: any) => {
      const locRankings = rankings.filter((r: any) => r.locationId === loc.id);
      const avg = locRankings.length
        ? (locRankings.reduce((s: number, r: any) => s + (r.rank ?? 0), 0) / locRankings.length).toFixed(1)
        : '-';
      const inTopThree = locRankings.filter((r: any) => (r.rank ?? 100) <= 3).length;
      const inLocalPack = locRankings.filter((r: any) => r.localPackRank != null).length;
      return { ...loc, avgRank: avg, keywordCount: locRankings.length, inTopThree, inLocalPack };
    });
  }, [locations, rankings]);

  return (
    <TierGateOverlay requiredTier="growth" feature="GEO Local SEO">
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">GEO Local SEO</h1>
            <p className="text-muted-foreground text-sm mt-1">Location rankings, citation audits, and local schema generation</p>
          </div>
          <Button onClick={() => scanMutation.mutate()} disabled={scanMutation.isPending} size="sm">
            {scanMutation.isPending ? 'Scanning...' : 'Run Full Scan'}
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <MetricCard title="Locations" value={String(locations.length)} />
          <MetricCard title="Rankings Tracked" value={String(rankings.length)} />
          <MetricCard title="Avg Rank" value={String(avgRank)} />
          <MetricCard title="Citation Issues" value={String(inconsistentCitations)} />
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Locations */}
          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-sm">Locations</h2>
              <Button size="sm" variant="outline" onClick={() => setShowAddLocation(v => !v)}>
                {showAddLocation ? 'Cancel' : '+ Add'}
              </Button>
            </div>

            {showAddLocation && (
              <div className="space-y-2 border rounded-lg p-3 bg-muted/30">
                {(['name', 'city', 'country', 'region', 'postalCode'] as const).map(field => (
                  <input
                    key={field}
                    className="w-full rounded border px-2 py-1 text-sm bg-background"
                    placeholder={field.charAt(0).toUpperCase() + field.slice(1).replace(/([A-Z])/g, ' $1')}
                    value={locationForm[field]}
                    onChange={e => setLocationForm(f => ({ ...f, [field]: e.target.value }))}
                  />
                ))}
                <Button
                  size="sm"
                  className="w-full"
                  disabled={!locationForm.name || !locationForm.city || !locationForm.country || addLocationMutation.isPending}
                  onClick={() => addLocationMutation.mutate(locationForm)}
                >
                  Add Location
                </Button>
              </div>
            )}

            {locationsLoading ? (
              <p className="text-sm text-muted-foreground">Loading...</p>
            ) : locations.length === 0 ? (
              <p className="text-sm text-muted-foreground">No locations configured.</p>
            ) : (
              <ul className="space-y-2">
                {locations.map((loc: any) => (
                  <li
                    key={loc.id}
                    className={`flex items-center justify-between text-sm p-2 rounded-lg cursor-pointer transition-colors ${
                      selectedLocationId === loc.id ? 'bg-primary/10 border border-primary/30' : 'hover:bg-muted/30'
                    }`}
                    onClick={() => setSelectedLocationId(id => id === loc.id ? null : loc.id)}
                  >
                    <div>
                      <p className="font-medium">{loc.name}</p>
                      <p className="text-xs text-muted-foreground">{loc.city}, {loc.country}</p>
                    </div>
                    <button
                      onClick={e => { e.stopPropagation(); deleteLocationMutation.mutate(loc.id); }}
                      className="text-muted-foreground hover:text-destructive text-xs"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* Rankings + Citations */}
          <div className="lg:col-span-2 space-y-4">
            {/* Rankings Table */}
            <Card className="p-4">
              <h2 className="font-semibold text-sm mb-3">
                Rankings {selectedLocationId ? `— ${locations.find((l: any) => l.id === selectedLocationId)?.city ?? ''}` : '(all locations)'}
              </h2>
              {rankingsLoading ? (
                <p className="text-sm text-muted-foreground">Loading...</p>
              ) : rankings.length === 0 ? (
                <p className="text-sm text-muted-foreground">No rankings yet. Run a scan to check local rankings.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b text-muted-foreground">
                        <th className="text-left py-1.5 pr-3">Keyword</th>
                        <th className="text-center py-1.5 pr-3">Rank</th>
                        <th className="text-center py-1.5 pr-3">Trend</th>
                        <th className="text-center py-1.5 pr-3">3-Pack</th>
                        <th className="text-left py-1.5">Checked</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rankings.slice(0, 20).map((r: any) => (
                        <tr key={r.id} className="border-b border-muted/30">
                          <td className="py-1.5 pr-3 font-medium">{r.keyword}</td>
                          <td className="py-1.5 pr-3 text-center">
                            <span className={`font-bold ${r.rank <= 3 ? 'text-green-500' : r.rank <= 10 ? 'text-yellow-500' : 'text-muted-foreground'}`}>
                              #{r.rank ?? '-'}
                            </span>
                          </td>
                          <td className="py-1.5 pr-3 text-center">
                            {r.previousRank != null ? (
                              r.previousRank > r.rank ? (
                                <span className="inline-flex items-center gap-0.5 text-green-500">
                                  <TrendingUp size={10} />
                                  <span className="text-[10px]">+{r.previousRank - r.rank}</span>
                                </span>
                              ) : r.previousRank < r.rank ? (
                                <span className="inline-flex items-center gap-0.5 text-red-500">
                                  <TrendingDown size={10} />
                                  <span className="text-[10px]">{r.previousRank - r.rank}</span>
                                </span>
                              ) : (
                                <Minus size={10} className="text-muted-foreground mx-auto" />
                              )
                            ) : (
                              <span className="text-muted-foreground text-[10px]">new</span>
                            )}
                          </td>
                          <td className="py-1.5 pr-3 text-center">
                            {r.localPackRank != null ? (
                              <span className="text-green-500 font-bold">#{r.localPackRank}</span>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </td>
                          <td className="py-1.5 text-muted-foreground">
                            {r.checkedAt ? new Date(r.checkedAt).toLocaleDateString() : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            {/* Citation Audit */}
            <Card className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold text-sm">Citation Audit</h2>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="text-green-500">{consistentCitations} consistent</span>
                  <span className="text-red-500">{inconsistentCitations} issues</span>
                </div>
              </div>
              {citationsLoading ? (
                <p className="text-sm text-muted-foreground">Loading...</p>
              ) : citations.length === 0 ? (
                <p className="text-sm text-muted-foreground">No citation data. Run a scan to audit your local listings.</p>
              ) : (
                <div className="space-y-2">
                  {citations.map((c: any) => (
                    <div key={c.id} className="flex items-start justify-between gap-2 p-2 rounded-lg border text-sm">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium capitalize">{c.directory?.replace(/_/g, ' ')}</span>
                          <Badge
                            variant={c.napConsistent ? 'outline' : 'destructive'}
                            className="text-xs"
                          >
                            {c.napConsistent ? 'Consistent' : 'Issues'}
                          </Badge>
                        </div>
                        {c.url && (
                          <a href={c.url} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline truncate block mt-0.5">
                            {c.url}
                          </a>
                        )}
                        {!c.napConsistent && Array.isArray(c.issues) && c.issues.length > 0 && (
                          <p className="text-xs text-destructive mt-1">{c.issues.slice(0, 2).join('; ')}</p>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {c.lastCheckedAt ? new Date(c.lastCheckedAt).toLocaleDateString() : '-'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </div>

        {/* Location Ranking Comparison */}
        {locationRankSummary.length > 1 && (
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <MapPin size={14} className="text-muted-foreground" />
              <h2 className="font-semibold text-sm">Location Ranking Comparison</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left py-1.5 pr-3">Location</th>
                    <th className="text-center py-1.5 pr-3">Keywords</th>
                    <th className="text-center py-1.5 pr-3">Avg Rank</th>
                    <th className="text-center py-1.5 pr-3">Top 3</th>
                    <th className="text-center py-1.5">Local Pack</th>
                  </tr>
                </thead>
                <tbody>
                  {locationRankSummary.map((loc: any) => (
                    <tr key={loc.id} className="border-b border-muted/30">
                      <td className="py-2 pr-3">
                        <p className="font-medium">{loc.name}</p>
                        <p className="text-muted-foreground">{loc.city}, {loc.country}</p>
                      </td>
                      <td className="py-2 pr-3 text-center">{loc.keywordCount}</td>
                      <td className="py-2 pr-3 text-center">
                        <span className={`font-bold ${Number(loc.avgRank) <= 5 ? 'text-green-500' : Number(loc.avgRank) <= 15 ? 'text-yellow-500' : 'text-muted-foreground'}`}>
                          {loc.avgRank}
                        </span>
                      </td>
                      <td className="py-2 pr-3 text-center">
                        <span className="text-green-500 font-bold">{loc.inTopThree}</span>
                      </td>
                      <td className="py-2 text-center">
                        <span className="text-primary font-bold">{loc.inLocalPack}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </TierGateOverlay>
  );
}

import { createClient, type ClickHouseClient } from '@clickhouse/client';

let client: ClickHouseClient | null = null;

export function getClickHouseClient(): ClickHouseClient {
  if (!client) {
    client = createClient({
      url: process.env.CLICKHOUSE_URL || 'http://localhost:8123',
      username: process.env.CLICKHOUSE_USER || 'default',
      password: process.env.CLICKHOUSE_PASSWORD || '',
      database: process.env.CLICKHOUSE_DATABASE || 'nexuszero',
      request_timeout: 30_000,
      clickhouse_settings: {
        max_execution_time: 60,
      },
    });
  }
  return client;
}

/** Initialize ClickHouse analytics tables */
export async function initClickHouseTables(): Promise<void> {
  const ch = getClickHouseClient();

  await ch.command({
    query: `
      CREATE TABLE IF NOT EXISTS marketing_events (
        tenant_id UUID,
        event_type String,
        campaign_id UUID,
        channel LowCardinality(String),
        impressions UInt64,
        clicks UInt64,
        conversions UInt64,
        spend Float64,
        revenue Float64,
        metadata String,
        event_date Date,
        event_time DateTime
      ) ENGINE = MergeTree()
      PARTITION BY toYYYYMM(event_date)
      ORDER BY (tenant_id, event_date, channel)
    `,
  });

  await ch.command({
    query: `
      CREATE TABLE IF NOT EXISTS metric_snapshots (
        tenant_id UUID,
        metric_name LowCardinality(String),
        metric_value Float64,
        campaign_id Nullable(UUID),
        channel LowCardinality(String),
        snapshot_date Date,
        snapshot_time DateTime
      ) ENGINE = MergeTree()
      PARTITION BY toYYYYMM(snapshot_date)
      ORDER BY (tenant_id, metric_name, snapshot_date)
    `,
  });

  await ch.command({
    query: `
      CREATE TABLE IF NOT EXISTS anomaly_log (
        tenant_id UUID,
        metric_name LowCardinality(String),
        observed_value Float64,
        expected_value Float64,
        z_score Float64,
        severity LowCardinality(String),
        root_cause String,
        detected_at DateTime
      ) ENGINE = MergeTree()
      PARTITION BY toYYYYMM(toDate(detected_at))
      ORDER BY (tenant_id, detected_at)
    `,
  });
}

/** Query daily aggregated metrics for a tenant */
export async function queryDailyMetrics(tenantId: string, date: string): Promise<{
  totalSpend: number;
  totalRevenue: number;
  totalImpressions: number;
  totalClicks: number;
  totalConversions: number;
  channelBreakdown: Record<string, { spend: number; revenue: number; conversions: number }>;
}> {
  const ch = getClickHouseClient();

  const result = await ch.query({
    query: `
      SELECT
        channel,
        sum(impressions) as impressions,
        sum(clicks) as clicks,
        sum(conversions) as conversions,
        sum(spend) as spend,
        sum(revenue) as revenue
      FROM marketing_events
      WHERE tenant_id = {tenantId:UUID} AND event_date = {date:Date}
      GROUP BY channel
    `,
    query_params: { tenantId, date },
    format: 'JSONEachRow',
  });

  const rows = await result.json<{
    channel: string;
    impressions: string;
    clicks: string;
    conversions: string;
    spend: string;
    revenue: string;
  }>();

  let totalSpend = 0, totalRevenue = 0, totalImpressions = 0, totalClicks = 0, totalConversions = 0;
  const channelBreakdown: Record<string, { spend: number; revenue: number; conversions: number }> = {};

  for (const row of rows) {
    const spend = parseFloat(row.spend);
    const revenue = parseFloat(row.revenue);
    const conversions = parseInt(row.conversions, 10);
    const impressions = parseInt(row.impressions, 10);
    const clicks = parseInt(row.clicks, 10);

    totalSpend += spend;
    totalRevenue += revenue;
    totalImpressions += impressions;
    totalClicks += clicks;
    totalConversions += conversions;

    channelBreakdown[row.channel] = { spend, revenue, conversions };
  }

  return { totalSpend, totalRevenue, totalImpressions, totalClicks, totalConversions, channelBreakdown };
}

/** Query metric history for anomaly detection / forecasting */
export async function queryMetricHistory(
  tenantId: string,
  metricName: string,
  days: number,
): Promise<Array<{ date: string; value: number }>> {
  const ch = getClickHouseClient();

  const result = await ch.query({
    query: `
      SELECT
        snapshot_date as date,
        avg(metric_value) as value
      FROM metric_snapshots
      WHERE tenant_id = {tenantId:UUID}
        AND metric_name = {metricName:String}
        AND snapshot_date >= today() - {days:UInt32}
      GROUP BY snapshot_date
      ORDER BY snapshot_date ASC
    `,
    query_params: { tenantId, metricName, days },
    format: 'JSONEachRow',
  });

  const rows = await result.json<{ date: string; value: string }>();
  return rows.map(r => ({ date: r.date, value: parseFloat(r.value) }));
}

/** Insert a metric snapshot into ClickHouse */
export async function insertMetricSnapshot(
  tenantId: string,
  metricName: string,
  value: number,
  campaignId?: string,
  channel?: string,
): Promise<void> {
  const ch = getClickHouseClient();

  await ch.insert({
    table: 'metric_snapshots',
    values: [{
      tenant_id: tenantId,
      metric_name: metricName,
      metric_value: value,
      campaign_id: campaignId || null,
      channel: channel || 'all',
      snapshot_date: new Date().toISOString().split('T')[0],
      snapshot_time: new Date().toISOString().replace('T', ' ').replace('Z', ''),
    }],
    format: 'JSONEachRow',
  });
}

/** Log an anomaly to ClickHouse */
export async function logAnomaly(
  tenantId: string,
  metricName: string,
  observedValue: number,
  expectedValue: number,
  zScore: number,
  severity: string,
  rootCause: string,
): Promise<void> {
  const ch = getClickHouseClient();

  await ch.insert({
    table: 'anomaly_log',
    values: [{
      tenant_id: tenantId,
      metric_name: metricName,
      observed_value: observedValue,
      expected_value: expectedValue,
      z_score: zScore,
      severity,
      root_cause: rootCause,
      detected_at: new Date().toISOString().replace('T', ' ').replace('Z', ''),
    }],
    format: 'JSONEachRow',
  });
}

/** Query cross-tenant aggregated patterns for compound insights */
export async function queryCrossTenantPatterns(): Promise<{
  channelPerformance: Record<string, { avgRoas: number; avgCtr: number; tenantCount: number }>;
  trends: Array<{ metric: string; direction: string; magnitude: number }>;
  totalTenants: number;
}> {
  const ch = getClickHouseClient();

  const channelResult = await ch.query({
    query: `
      SELECT
        channel,
        avgIf(revenue / spend, spend > 0) as avg_roas,
        avgIf(clicks / impressions, impressions > 0) as avg_ctr,
        uniq(tenant_id) as tenant_count
      FROM marketing_events
      WHERE event_date >= today() - 30
      GROUP BY channel
    `,
    format: 'JSONEachRow',
  });

  const channelRows = await channelResult.json<{
    channel: string; avg_roas: string; avg_ctr: string; tenant_count: string;
  }>();

  const channelPerformance: Record<string, { avgRoas: number; avgCtr: number; tenantCount: number }> = {};
  for (const row of channelRows) {
    channelPerformance[row.channel] = {
      avgRoas: parseFloat(row.avg_roas) || 0,
      avgCtr: parseFloat(row.avg_ctr) || 0,
      tenantCount: parseInt(row.tenant_count, 10),
    };
  }

  const trendResult = await ch.query({
    query: `
      SELECT
        metric_name,
        if(last_val > first_val, 'up', 'down') as direction,
        abs(last_val - first_val) / greatest(first_val, 0.001) as magnitude
      FROM (
        SELECT
          metric_name,
          argMin(metric_value, snapshot_date) as first_val,
          argMax(metric_value, snapshot_date) as last_val
        FROM metric_snapshots
        WHERE snapshot_date >= today() - 30
        GROUP BY metric_name
        HAVING count() > 5
      )
      ORDER BY magnitude DESC
      LIMIT 20
    `,
    format: 'JSONEachRow',
  });

  const trendRows = await trendResult.json<{ metric_name: string; direction: string; magnitude: string }>();
  const trends = trendRows.map(r => ({
    metric: r.metric_name,
    direction: r.direction,
    magnitude: parseFloat(r.magnitude),
  }));

  const countResult = await ch.query({
    query: `SELECT uniq(tenant_id) as total FROM marketing_events WHERE event_date >= today() - 30`,
    format: 'JSONEachRow',
  });
  const countRows = await countResult.json<{ total: string }>();
  const totalTenants = parseInt(countRows[0]?.total || '0', 10);

  return { channelPerformance, trends, totalTenants };
}

export async function closeClickHouseClient(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
  }
}

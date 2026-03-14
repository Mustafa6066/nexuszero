'use client';

import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell,
} from 'recharts';

const COLORS = ['#16a34a', '#22c55e', '#86efac', '#15803d', '#84cc16', '#4ade80'];

interface AreaChartProps {
  data: any[];
  dataKey: string;
  xAxisKey?: string;
  height?: number;
  color?: string;
}

export function AreaChartWidget({ data, dataKey, xAxisKey = 'date', height = 300, color = '#16a34a' }: AreaChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
        <defs>
          <linearGradient id={`gradient-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.3} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(0 0% 14.9%)" />
        <XAxis dataKey={xAxisKey} stroke="hsl(0 0% 40%)" fontSize={12} />
        <YAxis stroke="hsl(0 0% 40%)" fontSize={12} />
        <Tooltip
          contentStyle={{ backgroundColor: 'hsl(0 0% 6%)', border: '1px solid hsl(0 0% 14.9%)', borderRadius: '8px' }}
          labelStyle={{ color: 'hsl(0 0% 98%)' }}
        />
        <Area type="monotone" dataKey={dataKey} stroke={color} fillOpacity={1} fill={`url(#gradient-${dataKey})`} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

interface BarChartProps {
  data: any[];
  bars: Array<{ dataKey: string; color: string }>;
  xAxisKey?: string;
  height?: number;
}

export function BarChartWidget({ data, bars, xAxisKey = 'name', height = 300 }: BarChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(0 0% 14.9%)" />
        <XAxis dataKey={xAxisKey} stroke="hsl(0 0% 40%)" fontSize={12} />
        <YAxis stroke="hsl(0 0% 40%)" fontSize={12} />
        <Tooltip
          contentStyle={{ backgroundColor: 'hsl(0 0% 6%)', border: '1px solid hsl(0 0% 14.9%)', borderRadius: '8px' }}
          labelStyle={{ color: 'hsl(0 0% 98%)' }}
        />
        {bars.map((bar) => (
          <Bar key={bar.dataKey} dataKey={bar.dataKey} fill={bar.color} radius={[4, 4, 0, 0]} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

interface DonutChartProps {
  data: Array<{ name: string; value: number }>;
  height?: number;
}

export function DonutChartWidget({ data, height = 250 }: DonutChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={60}
          outerRadius={90}
          paddingAngle={4}
          dataKey="value"
        >
          {data.map((_, index) => (
            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{ backgroundColor: 'hsl(0 0% 6%)', border: '1px solid hsl(0 0% 14.9%)', borderRadius: '8px' }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

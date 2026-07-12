'use client';

import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
} from 'recharts';

import type { ScoreBreakdown } from '@/lib/api/types';

/** ScoreRadarChart の内部実装。`next/dynamic` で lazy 化するために recharts import を分離する。 */
export function ScoreRadarChartInner<A extends string>({
  breakdown,
  axisLabel,
  ariaLabel,
}: {
  breakdown: ScoreBreakdown<A>;
  axisLabel: Record<A, string>;
  ariaLabel: string;
}) {
  const data = (Object.keys(axisLabel) as A[]).map((axis) => ({
    axis: axisLabel[axis],
    score: breakdown[axis]?.score ?? 0,
  }));

  return (
    <div
      className="bg-card text-card-foreground h-72 w-full rounded-md border"
      role="img"
      aria-label={ariaLabel}
    >
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart
          data={data}
          outerRadius="70%"
          margin={{ top: 16, right: 24, bottom: 16, left: 24 }}
        >
          <PolarGrid stroke="var(--border)" />
          <PolarAngleAxis dataKey="axis" tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }} />
          <PolarRadiusAxis
            angle={90}
            domain={[0, 20]}
            tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }}
            tickCount={5}
          />
          <Radar
            name="score"
            dataKey="score"
            stroke="var(--primary)"
            fill="var(--primary)"
            fillOpacity={0.35}
            isAnimationActive={false}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}

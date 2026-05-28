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

/**
 * 5 軸スコア(各 0-20 点)をレーダーチャートで描画する(ADR-013 / 改訂版)。
 *
 * - プロダクト診断(`ServiceScore`)とアイデア検証(`IdeaValidation`)で共有(`A` でジェネリック化)
 * - recharts は内部で `window` を参照するため Client Component 必須(`ResponsiveContainer` 含む)
 * - `aria-label` でスクリーンリーダー向けに総合スコアを伝える(視覚情報のみに依存しない)
 * - 親に `min-h-[280px]` 以上の高さを与えること(`ResponsiveContainer` は親高さに追随)
 */
export function ScoreRadarChart<A extends string>({
  breakdown,
  axisLabel,
  ariaLabel,
}: {
  breakdown: ScoreBreakdown<A>;
  axisLabel: Record<A, string>;
  /** スクリーンリーダー用のラベル(例「アイデア検証 5 軸スコア」)。 */
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

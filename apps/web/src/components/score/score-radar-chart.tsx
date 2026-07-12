'use client';

import dynamic from 'next/dynamic';

import type { ScoreBreakdown } from '@/lib/api/types';

/**
 * 5 軸スコアをレーダーチャートで描画(ADR-013 / 改訂版)。
 *
 * recharts(~100kB gzip)は次のようなユーザー動線でのみ描画されるため、`next/dynamic` で lazy 化して
 * initial bundle から切り離す:
 * - プロダクト診断(`ServiceScore`)結果ページ
 * - アイデア検証(`IdeaValidation`)結果ページ
 *
 * recharts は `window` を参照するため SSR 不可(`ssr: false`)。親には最低 `h-72`(288px)以上の
 * 高さを確保すること(`ResponsiveContainer` が親高さに追随する)。
 */
const InternalChart = dynamic(
  () => import('./score-radar-chart-inner').then((m) => m.ScoreRadarChartInner),
  {
    ssr: false,
    loading: () => (
      <div
        className="bg-card h-72 w-full animate-pulse rounded-md border"
        role="img"
        aria-label="スコアチャートを読み込み中"
      />
    ),
  },
);

export function ScoreRadarChart<A extends string>(props: {
  breakdown: ScoreBreakdown<A>;
  axisLabel: Record<A, string>;
  ariaLabel: string;
}) {
  // next/dynamic は非ジェネリック関数 component を返すため、型ジェネリックは外側 wrapper で保持する。
  return <InternalChart {...(props as unknown as React.ComponentProps<typeof InternalChart>)} />;
}

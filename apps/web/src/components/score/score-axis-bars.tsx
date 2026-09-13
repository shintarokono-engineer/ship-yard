import { Progress } from '@/components/ui/progress';
import { AXIS_MAX_SCORE, type ScoreBreakdown } from '@/lib/api/types';

/**
 * 各軸のスコア(0-20 点)を横棒とコメントで見せる。
 *
 * レーダーが形状で全体バランスを伝えるのに対し、こちらは軸ごとの**コメントを読ませる**のが主目的。
 */
export function ScoreAxisBars<A extends string>({
  breakdown,
  axisLabel,
}: {
  breakdown: ScoreBreakdown<A>;
  axisLabel: Record<A, string>;
}) {
  const axes = Object.keys(axisLabel) as A[];

  return (
    <ul className="space-y-5">
      {axes.map((axis) => {
        const entry = breakdown[axis];
        const score = Math.max(0, Math.min(AXIS_MAX_SCORE, entry?.score ?? 0));
        return (
          <li key={axis} className="space-y-2">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm font-medium">{axisLabel[axis]}</span>
              <span className="text-muted-foreground text-xs tabular-nums">
                <span className="text-foreground text-sm font-semibold">{score}</span> /{' '}
                {AXIS_MAX_SCORE}
              </span>
            </div>
            <Progress
              value={(score / AXIS_MAX_SCORE) * 100}
              aria-label={axisLabel[axis]}
              className="h-1.5"
            />
            {entry?.comment ? (
              <p className="text-muted-foreground text-xs leading-5">{entry.comment}</p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

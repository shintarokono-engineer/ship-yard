import type { ScoreBreakdown } from '@/lib/api/types';

/**
 * 5 軸スコア(各 0-20 点)を横棒で描画する(レーダーチャートの補助)。
 *
 * - レーダーは形状で全体バランスを伝え、こちらは各軸の **コメント** を読ませることを主目的とする
 * - 進捗バーは `<progress>` だとブラウザ差が大きいので、`div` のスタイルで自前描画
 * - Server Component で動作(ステート不要)
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
    <ul className="space-y-4">
      {axes.map((axis) => {
        const entry = breakdown[axis];
        const score = entry?.score ?? 0;
        const percent = Math.max(0, Math.min(100, (score / 20) * 100));
        return (
          <li key={axis} className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm font-medium">{axisLabel[axis]}</span>
              <span className="text-muted-foreground text-xs tabular-nums">{score} / 20</span>
            </div>
            <div
              className="bg-muted h-2 w-full overflow-hidden rounded-full"
              role="progressbar"
              aria-valuenow={score}
              aria-valuemin={0}
              aria-valuemax={20}
              aria-label={axisLabel[axis]}
            >
              <div
                className="bg-primary h-full rounded-full transition-[width]"
                style={{ width: `${percent}%` }}
              />
            </div>
            {entry?.comment ? (
              <p className="text-muted-foreground text-xs leading-5">{entry.comment}</p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

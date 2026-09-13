import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { AXIS_MAX_SCORE } from '@/lib/api/types';

import { SAMPLE_AXES, SAMPLE_SUGGESTION, SAMPLE_TOTAL_SCORE } from '../_shared/sample-result';

/** 入力の隣に置く結果のイメージ(装飾用のモック)。実行前に「点数と内訳が返る」ことを一目で伝える。 */
export function ScorePreview() {
  return (
    <div
      aria-hidden="true"
      className="bg-card hidden w-56 rotate-2 space-y-4 rounded-xl border p-5 shadow-xl lg:block"
    >
      <div className="text-center">
        <p className="text-muted-foreground text-[11px]">アイデア検証スコア</p>
        <p className="flex items-baseline justify-center gap-1">
          <span className="text-4xl leading-none font-semibold tracking-tight tabular-nums">
            {SAMPLE_TOTAL_SCORE}
          </span>
          <span className="text-muted-foreground text-sm">/ 100</span>
        </p>
      </div>
      <ul className="space-y-2.5">
        {SAMPLE_AXES.map((axis) => (
          <li key={axis.label} className="space-y-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[11px] font-medium">{axis.label}</span>
              <span className="text-muted-foreground text-[10px] tabular-nums">
                {axis.score} / {AXIS_MAX_SCORE}
              </span>
            </div>
            <Progress value={(axis.score / AXIS_MAX_SCORE) * 100} className="h-1" />
          </li>
        ))}
      </ul>
      <div className="bg-muted/50 space-y-1.5 rounded-md border p-2.5">
        <Badge variant="destructive" className="text-[9px]">
          HIGH
        </Badge>
        <p className="text-[11px] leading-4 font-medium">{SAMPLE_SUGGESTION.title}</p>
        <span className="bg-muted-foreground/20 block h-1 w-full rounded-full" />
        <span className="bg-muted-foreground/20 block h-1 w-4/5 rounded-full" />
      </div>
    </div>
  );
}

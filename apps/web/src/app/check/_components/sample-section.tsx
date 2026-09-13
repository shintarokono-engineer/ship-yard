import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { AXIS_MAX_SCORE } from '@/lib/api/types';

import { SAMPLE_AXES, SAMPLE_SUGGESTION, SAMPLE_TOTAL_SCORE } from '../_shared/sample-result';

/** 実行前に「何が返ってくるか」を見せるセクション。中身は装飾用のモック(`sample-result.ts`)。 */
export function SampleSection() {
  return (
    <section className="bg-card scroll-mt-20 border-t">
      <div className="mx-auto max-w-6xl px-6 py-20 sm:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-primary text-sm font-semibold">RESULT</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
            返ってくるのは、点数だけではありません
          </h2>
          <p className="text-muted-foreground mt-4 text-pretty">
            観点ごとの点数と
            <strong className="text-foreground font-medium">そう判断した理由</strong>、 そして
            <strong className="text-foreground font-medium">何をどう直すか</strong>まで返します。
          </p>
        </div>

        <div
          aria-hidden="true"
          className="bg-background mx-auto mt-14 max-w-3xl overflow-hidden rounded-xl border shadow-xl"
        >
          <div className="bg-muted/40 flex items-center gap-2 border-b px-4 py-3">
            <span className="bg-muted-foreground/20 size-3 rounded-full" />
            <span className="bg-muted-foreground/20 size-3 rounded-full" />
            <span className="bg-muted-foreground/20 size-3 rounded-full" />
          </div>

          <div className="grid gap-8 p-6 sm:p-8 md:grid-cols-[auto_1fr]">
            <div className="flex flex-col items-center justify-center gap-2 md:w-40">
              <span className="text-muted-foreground text-xs">アイデア検証スコア</span>
              <span className="flex items-baseline gap-1">
                <span className="text-6xl leading-none font-semibold tracking-tight tabular-nums">
                  {SAMPLE_TOTAL_SCORE}
                </span>
                <span className="text-muted-foreground text-base">/ 100</span>
              </span>
              <Progress value={SAMPLE_TOTAL_SCORE} className="h-1.5" />
            </div>

            <ul className="space-y-4">
              {SAMPLE_AXES.map((axis) => (
                <li key={axis.label} className="space-y-1.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm font-medium">{axis.label}</span>
                    <span className="text-muted-foreground text-xs tabular-nums">
                      <span className="text-foreground text-sm font-semibold">{axis.score}</span> /{' '}
                      {AXIS_MAX_SCORE}
                    </span>
                  </div>
                  <Progress value={(axis.score / AXIS_MAX_SCORE) * 100} className="h-1.5" />
                  <p className="text-muted-foreground text-xs leading-5">{axis.comment}</p>
                </li>
              ))}
            </ul>
          </div>

          <div className="border-t p-6 sm:p-8">
            <p className="text-muted-foreground mb-3 text-xs font-medium">改善提案(抜粋)</p>
            <div className="bg-card space-y-2 rounded-lg border p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="destructive">HIGH</Badge>
                <span className="text-muted-foreground text-xs">{SAMPLE_SUGGESTION.axisLabel}</span>
              </div>
              <p className="text-sm font-semibold">{SAMPLE_SUGGESTION.title}</p>
              <p className="text-muted-foreground text-sm leading-6">{SAMPLE_SUGGESTION.body}</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

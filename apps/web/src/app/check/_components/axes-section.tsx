import { Lock } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from '@/components/ui/item';
import {
  AXIS_MAX_SCORE,
  PUBLIC_CHECK_AXES,
  PUBLIC_CHECK_LOCKED_AXES,
  VALIDATION_AXIS_LABEL,
  type ValidationAxis,
} from '@/lib/api/types';

/** 観点の一行説明。採点基準の本文は長いので、画面用に要点だけを持つ。 */
const AXIS_SUMMARY: Record<ValidationAxis, string> = {
  problemClarity: 'その困りごとは実際にあって、相手が本当に困っているか',
  targetClarity: 'その人たちは実際にいて、見つけられて、お金を払う余地があるか',
  differentiation: 'その解き方で解決するか。今あるやり方で足りてしまわないか',
  competitiveAdvantage: '似たサービスと比べて勝てるところがあるか',
  marketPotential: '十分な人数がいて、これから増えていく市場か',
};

/** 評価する観点の紹介。ロックした 2 つを入力前から見せ、無料版の範囲を先に伝える。 */
export function AxesSection() {
  return (
    <section id="axes" className="scroll-mt-20 border-t">
      <div className="mx-auto max-w-6xl px-6 py-20 sm:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-primary text-sm font-semibold">SCORING</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
            5 つの観点で採点します
          </h2>
          <p className="text-muted-foreground mt-4 text-pretty">
            無料版で採点するのは、はじめの 3 つ。残りの 2
            つは実際の競合を調べる必要があるため、アカウント登録後に採点します。
          </p>
        </div>

        <ItemGroup className="mx-auto mt-14 max-w-3xl gap-3">
          {PUBLIC_CHECK_AXES.map((axis, index) => (
            <Item key={axis} variant="outline">
              <ItemMedia>
                <span className="bg-accent text-primary flex size-10 items-center justify-center rounded-lg text-base font-semibold tabular-nums">
                  {index + 1}
                </span>
              </ItemMedia>
              <ItemContent>
                <ItemTitle>{VALIDATION_AXIS_LABEL[axis]}</ItemTitle>
                <ItemDescription>{AXIS_SUMMARY[axis]}</ItemDescription>
              </ItemContent>
              <ItemActions className="text-muted-foreground text-sm tabular-nums">
                {AXIS_MAX_SCORE} 点
              </ItemActions>
            </Item>
          ))}

          {PUBLIC_CHECK_LOCKED_AXES.map((axis) => (
            <Item
              key={axis}
              variant="outline"
              className="text-muted-foreground border-dashed bg-transparent"
            >
              <ItemMedia>
                <span className="bg-muted flex size-10 items-center justify-center rounded-lg">
                  <Lock className="size-4" aria-hidden="true" />
                </span>
              </ItemMedia>
              <ItemContent>
                <ItemTitle className="font-normal">{VALIDATION_AXIS_LABEL[axis]}</ItemTitle>
                <ItemDescription>{AXIS_SUMMARY[axis]}</ItemDescription>
              </ItemContent>
              <ItemActions>
                <Badge variant="outline" className="font-normal">
                  アカウント登録で判定
                </Badge>
              </ItemActions>
            </Item>
          ))}
        </ItemGroup>

        <p className="text-muted-foreground mx-auto mt-6 max-w-3xl text-xs leading-5">
          2 つを加えると合計点は変わります(多くの場合下がります)。
        </p>
      </div>
    </section>
  );
}

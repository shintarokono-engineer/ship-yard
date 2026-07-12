import type { StatsBlock } from '@/lib/api/types';
import { cn } from '@/lib/utils';

import type { LpThemeClasses } from './lp-theme';

/**
 * LP の stats ブロック(数値アピール)。プレビュー(Day 31)と公開ページ(Day 33)で共用。
 * 数値はカラーテーマ(ADR-009 Phase 5a)のアクセント色で強調する。
 */
export function StatsBlockView({
  block,
  themeClasses,
}: {
  block: StatsBlock;
  themeClasses: LpThemeClasses;
}) {
  return (
    <section className="bg-background px-6 py-16">
      <div className="mx-auto flex max-w-4xl flex-wrap justify-center gap-x-16 gap-y-10">
        {block.items.map((item) => (
          <div
            key={`${item.label}-${item.value}`}
            className="flex flex-col items-center gap-1 text-center"
          >
            <span
              className={cn(
                'text-4xl font-bold tracking-tight sm:text-5xl',
                themeClasses.accentText,
              )}
            >
              {item.value}
            </span>
            <span className="text-muted-foreground text-sm">{item.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

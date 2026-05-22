import type { CtaBlock } from '@/lib/api/types';
import { cn } from '@/lib/utils';

import { safeHref } from './safe-href';
import type { LpThemeClasses } from './lp-theme';

/**
 * LP の cta ブロック(ページ下部の行動喚起)。プレビュー(Day 31)と公開ページ(Day 33)で共用。
 * セクション背景にカラーテーマ(ADR-009 Phase 5a)のアクセント色を使う。
 */
export function CtaBlockView({
  block,
  themeClasses,
}: {
  block: CtaBlock;
  themeClasses: LpThemeClasses;
}) {
  return (
    <section className={cn('px-6 py-20', themeClasses.accentSolid)}>
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-6 text-center">
        <h2 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">
          {block.heading}
        </h2>
        <a
          href={safeHref(block.buttonHref)}
          className="bg-background text-foreground hover:bg-background/90 inline-flex h-11 items-center rounded-lg px-6 text-sm font-medium transition-colors"
        >
          {block.buttonText}
        </a>
      </div>
    </section>
  );
}

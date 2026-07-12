import type { FeaturesBlock } from '@/lib/api/types';
import { cn } from '@/lib/utils';

import type { LpThemeClasses } from './lp-theme';

/**
 * LP の features ブロック(主要機能の紹介)。プレビュー(Day 31)と公開ページ(Day 33)で共用。
 *
 * `icon` は AI 由来の短い文字列(絵文字想定)。アイコンライブラリへのマッピングはせず、
 * そのままテキストとして描画する(空なら ✨ で代替)。`themeClasses` はカラーテーマ由来の配色。
 */
export function FeaturesBlockView({
  block,
  themeClasses,
}: {
  block: FeaturesBlock;
  themeClasses: LpThemeClasses;
}) {
  return (
    <section className={cn('px-6 py-20', themeClasses.sectionBg)}>
      <div className="mx-auto max-w-5xl">
        {block.title && (
          <h2
            className={cn(
              'mb-12 text-center text-3xl font-bold tracking-tight',
              themeClasses.accentText,
            )}
          >
            {block.title}
          </h2>
        )}
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {block.items.map((item) => (
            <div
              key={`${item.title}-${item.icon ?? ''}`}
              className="bg-card flex flex-col gap-3 rounded-xl border p-6"
            >
              <span
                className={cn(
                  'flex size-11 items-center justify-center rounded-lg text-xl',
                  themeClasses.accentSoft,
                )}
                aria-hidden="true"
              >
                {item.icon || '✨'}
              </span>
              <h3 className="font-semibold">{item.title}</h3>
              {item.body && <p className="text-muted-foreground text-sm">{item.body}</p>}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

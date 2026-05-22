import Image from 'next/image';

import type { TestimonialBlock } from '@/lib/api/types';
import { cn } from '@/lib/utils';

import type { LpThemeClasses } from './lp-theme';

/**
 * LP の testimonial ブロック(利用者の声)。プレビュー(Day 31)と公開ページ(Day 33)で共用。
 *
 * `avatar` はユーザー / AI 由来の任意 URL のため `next/image` を `unoptimized` で描画する。
 * 未指定なら発言者名の頭文字でプレースホルダを表示する(カラーテーマのアクセント色を使う)。
 */
export function TestimonialBlockView({
  block,
  themeClasses,
}: {
  block: TestimonialBlock;
  themeClasses: LpThemeClasses;
}) {
  return (
    <section className={cn('px-6 py-20', themeClasses.sectionBg)}>
      <figure className="mx-auto flex max-w-2xl flex-col items-center gap-6 text-center">
        <blockquote className="text-xl font-medium text-pretty sm:text-2xl">
          “{block.quote}”
        </blockquote>
        <figcaption className="flex items-center gap-3">
          {block.avatar ? (
            <span className="relative size-11 overflow-hidden rounded-full border">
              <Image
                src={block.avatar}
                alt=""
                fill
                unoptimized
                sizes="44px"
                className="object-cover"
              />
            </span>
          ) : (
            <span
              className={cn(
                'flex size-11 items-center justify-center rounded-full text-sm font-semibold',
                themeClasses.accentSoft,
              )}
              aria-hidden="true"
            >
              {(block.name || '?').charAt(0)}
            </span>
          )}
          <span className="text-left">
            <span className="block text-sm font-semibold">{block.name}</span>
            {block.role && (
              <span className="text-muted-foreground block text-xs">{block.role}</span>
            )}
          </span>
        </figcaption>
      </figure>
    </section>
  );
}

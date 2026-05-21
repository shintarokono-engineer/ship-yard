import Image from 'next/image';

import type { HeroBlock } from '@/lib/api/types';

import { safeHref } from './safe-href';

/**
 * LP の hero ブロック(ファーストビュー)。プレビュー(Day 31)と公開ページ(Day 33)で共用。
 *
 * `image` はユーザー / AI 由来の任意 URL のため、`next/image` の最適化対象外(`unoptimized`)で
 * 描画する(`remotePatterns` 設定なしで任意ホストを許容するため)。`headingLevel` は見出し階層の
 * 調整用:公開ページは h1、アプリ内プレビューはページ側に h1 があるため h2 を渡す。
 */
export function HeroBlockView({
  block,
  headingLevel = 1,
}: {
  block: HeroBlock;
  headingLevel?: 1 | 2;
}) {
  const Heading = headingLevel === 2 ? 'h2' : 'h1';
  return (
    <section className="bg-background px-6 py-20 sm:py-28">
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-6 text-center">
        <Heading className="text-4xl font-bold tracking-tight text-balance sm:text-5xl">
          {block.heading}
        </Heading>
        {block.sub && (
          <p className="text-muted-foreground max-w-2xl text-lg text-pretty">{block.sub}</p>
        )}
        <a
          href={safeHref(block.ctaHref)}
          className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-11 items-center rounded-lg px-6 text-sm font-medium transition-colors"
        >
          {block.ctaText}
        </a>
        {block.image && (
          <div className="relative mt-8 aspect-[16/9] w-full overflow-hidden rounded-xl border">
            <Image
              src={block.image}
              alt=""
              fill
              unoptimized
              sizes="768px"
              className="object-cover"
            />
          </div>
        )}
      </div>
    </section>
  );
}

import type { LpBlock, LpTheme } from '@/lib/api/types';

import { CtaBlockView } from './cta-block';
import { FeaturesBlockView } from './features-block';
import { FooterBlockView } from './footer-block';
import { HeroBlockView } from './hero-block';
import { getLpThemeClasses } from './lp-theme';
import { StatsBlockView } from './stats-block';
import { TestimonialBlockView } from './testimonial-block';

/**
 * LP のブロック配列を表示順に描画する(ADR-009)。プレビュー(Day 31)と公開ページ(Day 33)で共用。
 *
 * ブロックには id が無く配列の並び順そのものが表示順なので、key は index ベース
 * (並び替え / 追加削除は v2 のため index が安定キーになる)。
 * `headingLevel` は hero の見出し階層:公開ページは h1、アプリ内プレビューは h2(ページ側に h1 がある)。
 * `theme` はカラーテーマ(ADR-009 Phase 5a)。アクセント色のみブロックに伝播する。
 */
export function LpRenderer({
  blocks,
  theme = 'default',
  headingLevel = 1,
}: {
  blocks: LpBlock[];
  theme?: LpTheme;
  headingLevel?: 1 | 2;
}) {
  const themeClasses = getLpThemeClasses(theme);
  return (
    <div className="bg-background">
      {blocks.map((block, i) => {
        const key = `${block.type}-${i}`;
        switch (block.type) {
          case 'hero':
            return (
              <HeroBlockView
                key={key}
                block={block}
                themeClasses={themeClasses}
                headingLevel={headingLevel}
              />
            );
          case 'features':
            return <FeaturesBlockView key={key} block={block} themeClasses={themeClasses} />;
          case 'stats':
            return <StatsBlockView key={key} block={block} themeClasses={themeClasses} />;
          case 'testimonial':
            return <TestimonialBlockView key={key} block={block} themeClasses={themeClasses} />;
          case 'cta':
            return <CtaBlockView key={key} block={block} themeClasses={themeClasses} />;
          case 'footer':
            return <FooterBlockView key={key} block={block} />;
        }
      })}
    </div>
  );
}

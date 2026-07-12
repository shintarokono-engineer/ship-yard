import type { LpBlock } from '@/lib/api/types';

/**
 * LpBlock 配列の React key を生成する。schema に stable id が無いため、各 block 種別の主要フィールド
 * (heading / title / copyright 等)を含む合成 key を返す(reorder / delete が入っても同 block なら安定)。
 * v2 で block に uuid を持たせる方針が確定したら、本ヘルパーを `block.id` 直返しに置き換える。
 */
export function getLpBlockKey(block: LpBlock): string {
  switch (block.type) {
    case 'hero':
      return `hero:${block.heading}`;
    case 'features':
      return `features:${block.title}`;
    case 'stats':
      return `stats:${block.items.map((i) => i.label).join('|')}`;
    case 'testimonial':
      return `testimonial:${block.quote.slice(0, 40)}`;
    case 'cta':
      return `cta:${block.heading}`;
    case 'footer':
      return `footer:${block.copyright}`;
  }
}

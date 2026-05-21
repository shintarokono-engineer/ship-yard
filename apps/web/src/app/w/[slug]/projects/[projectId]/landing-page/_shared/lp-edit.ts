/**
 * LP 編集(ADR-009、Day 32)で Server Action と編集 UI が共有する型・定数・検証ヘルパー。
 */

import type { LpBlock, LpBlockType } from '@/lib/api/types';

/** LP 編集 Server Action の戻り値。成功時は redirect するため `ok: true` は実質エラー無しの意。 */
export interface UpdateLpState {
  ok: boolean;
  formError?: string;
}

export const INITIAL_UPDATE_LP_STATE: UpdateLpState = { ok: false };

/** ブロック種別の表示ラベル(編集 UI のカード見出し)。 */
export const LP_BLOCK_TYPE_LABEL: Record<LpBlockType, string> = {
  hero: 'ヒーロー',
  features: '機能紹介',
  stats: '実績・数値',
  testimonial: '利用者の声',
  cta: 'CTA(行動喚起)',
  footer: 'フッター',
};

/**
 * ブロックの必須テキストが全て埋まっているかを検証する(API 側 `parseLpBlocks` の必須条件に対応)。
 *
 * 必須フィールドを空のまま保存すると `parseLpBlocks` が該当ブロック / item を黙って落とすため、
 * 保存前に編集 UI 側で弾く(保存ボタンの活性制御に使う)。
 */
export function isLpBlockValid(block: LpBlock): boolean {
  const filled = (s: string) => s.trim().length > 0;
  switch (block.type) {
    case 'hero':
      return filled(block.heading) && filled(block.ctaText) && filled(block.ctaHref);
    case 'features':
      return block.items.length > 0 && block.items.every((it) => filled(it.title));
    case 'stats':
      return (
        block.items.length > 0 && block.items.every((it) => filled(it.value) && filled(it.label))
      );
    case 'testimonial':
      return filled(block.quote);
    case 'cta':
      return filled(block.heading) && filled(block.buttonText) && filled(block.buttonHref);
    case 'footer':
      return block.links.every((l) => filled(l.label));
  }
}

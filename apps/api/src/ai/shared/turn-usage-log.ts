import type { Logger } from '@nestjs/common';

/**
 * 2-step 構成(PRODUCT_DIAGNOSIS / IDEA_VALIDATION)の turn 別トークン内訳をログ出力する。
 *
 * `AIUsage` は turn1 + turn2 の**合算しか記録しない**ため、コスト削減の検討に必要な
 * 「どちらの turn が重いか」「turn 2 の入力のうち何割が turn 1 の再送か」が分からない。
 *
 * ADR-017 以降、turn 2 へは turn 1 の**最終 text だけ**を渡している(`extractTextContentOrNull`)。
 * `turn1.content` のブロック種別ごとの文字数を出しているのは、**その判断が今も妥当かを監視するため**。
 * `text 以外` が肥大しても turn 2 には乗らないが、turn 1 側の入力として課金されるので、
 * 検索回数(`WEB_SEARCH_MAX_USES`)の調整判断に使う。
 *
 * 2026-08-30 の実測では 1 回あたり tokensIn 67,831 / ¥41.65(Web Search 料金は別途最大 ¥7.5)。
 * ADR-017 の対策後は ¥20.35 まで下がった。
 *
 * **恒久ログとして残す。**診断 / 検証は月 30 回上限(300cr ÷ 10cr)で量が知れており、
 * 2-step のコスト配分は今後もチューニング対象(turn 数削減・非同期化)であるため観測を続ける。
 * 不要になったら削除するか `debug` に落とすこと。
 */
export function logTwoStepUsage(
  logger: Logger,
  feature: string,
  turn1: { usage: { input_tokens: number; output_tokens: number }; content: unknown[] },
  turn2: { usage: { input_tokens: number; output_tokens: number } },
): void {
  const byType = new Map<string, { blocks: number; chars: number }>();
  for (const block of turn1.content) {
    const type =
      typeof block === 'object' && block !== null && 'type' in block
        ? String((block as { type: unknown }).type)
        : 'unknown';
    const chars = JSON.stringify(block)?.length ?? 0;
    const acc = byType.get(type) ?? { blocks: 0, chars: 0 };
    byType.set(type, { blocks: acc.blocks + 1, chars: acc.chars + chars });
  }

  const textChars = byType.get('text')?.chars ?? 0;
  const totalChars = [...byType.values()].reduce((sum, v) => sum + v.chars, 0);
  const droppableChars = totalChars - textChars;
  const breakdown = [...byType.entries()]
    .sort((a, b) => b[1].chars - a[1].chars)
    .map(([type, v]) => `${type}=${v.blocks}blk/${v.chars}ch`)
    .join(' ');

  logger.log(
    `[cost] ${feature} ` +
      `turn1(in=${turn1.usage.input_tokens} out=${turn1.usage.output_tokens}) ` +
      `turn2(in=${turn2.usage.input_tokens} out=${turn2.usage.output_tokens}) ` +
      `total(in=${turn1.usage.input_tokens + turn2.usage.input_tokens} ` +
      `out=${turn1.usage.output_tokens + turn2.usage.output_tokens}) | ` +
      `turn1.content: ${breakdown} | ` +
      `text=${textChars}ch, text以外=${droppableChars}ch(turn 2 で落とせる候補)`,
  );
}

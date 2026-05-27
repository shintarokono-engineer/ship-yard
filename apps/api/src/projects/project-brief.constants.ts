/**
 * Project の構造化セレクト 2 フィールドの選択肢定義(ADR-013 改訂版「構造化入力 v2」、Day 46.5 案 A)。
 *
 * BE / FE / AI prompt で同じ enum 値を使う設計。Prisma の Enum 化はせず TEXT で柔軟性確保
 * (将来 v2 で enum 化検討)、Day 46.5 時点では「許可値リスト + アプリ層検証」 の組み合わせで
 * `@IsIn` でガードする。
 *
 * **設計方針(案 A 採用、Day 46.5 内で再設計)**:
 *   - 初版で導入した 5 構造化セレクト(targetUserAttrs / problemCategory / coreFeatures /
 *     pricingType / pricingRange)は B2B SaaS 前提の語彙で全プロダクト(B2C / B2B /
 *     個人ツール / ゲーム / SNS 等)に対応できなかったため drop
 *   - 代わりに全プロダクト適用可能な「ドメイン分類(categoryDomain)」 + 「課金 + 価格帯統合
 *     (pricingTier)」 の 2 軸のみに絞る(矛盾組合せが起きえない設計)
 *   - 想定ユーザー / 解きたい課題 / 想定機能 / 価格モデル詳細 は textarea 自由補足に逃がす
 *     (プレースホルダー + ヘルプテキストで誘導)
 *
 * **SSoT 注意**: 本ファイルは BE 側 SSoT。FE 側にも同じ enum 値が
 * `apps/web/src/lib/api/types.ts` に再定義されている(SSoT 違反、`packages/shared` への
 * 切り出しは v1.x フォローアップ)。値を追加・削除する場合は、必ず以下を**同時に**更新すること:
 *   1. `apps/web/src/lib/api/types.ts` の対応する const 配列と `*_LABEL` Record(UI 表示用)
 *   2. 本ファイルの `*_PROMPT_LABEL` Record(AI 用日本語ラベル)
 *   3. `docs/adr/013-product-diagnosis.md`「構造化入力 v2」 改訂節の enum 候補値表
 *   4. `packages/db/prisma/schema.prisma` の Project 該当フィールドの triple-slash コメント
 */

/** プロダクトのドメイン分類(B2C / B2B 両対応、業界横断で適用可能な大分類)。 */
export const CATEGORY_DOMAINS = [
  'ENTERTAINMENT',
  'PRODUCTIVITY',
  'EDUCATION',
  'FINANCE',
  'HEALTH',
  'COMMERCE',
  'SOCIAL',
  'DEVELOPER_TOOL',
  'LIFESTYLE',
  'OTHER',
] as const;
export type CategoryDomain = (typeof CATEGORY_DOMAINS)[number];

/**
 * 課金モデル + 月額レンジを統合した 1 軸。
 * 旧 `pricingType` + `pricingRange` の 2 軸構成は `FREE_ONLY` + `UNDER_500` のような
 * 矛盾組合せを許容してしまうため、Day 46.5 案 A で 1 軸に統合した。
 */
export const PRICING_TIERS = [
  'FREE_ONLY',
  'FREEMIUM_UNDER_1000',
  'FREEMIUM_1000_3000',
  'FREEMIUM_OVER_3000',
  'PAID_UNDER_1000',
  'PAID_1000_3000',
  'PAID_OVER_3000',
  'USAGE_BASED',
  'AD_SUPPORTED',
  'DONATION',
] as const;
export type PricingTier = (typeof PRICING_TIERS)[number];

/** AI prompt 用の日本語ラベル(Sonnet が値を解釈するためのヒント)。FE 表示用ラベルとは別。 */
export const CATEGORY_DOMAIN_PROMPT_LABEL: Record<CategoryDomain, string> = {
  ENTERTAINMENT: 'エンタメ(ゲーム / 動画 / 音楽 / メディア 等)',
  PRODUCTIVITY: '生産性(タスク管理 / メモ / コラボレーション 等)',
  EDUCATION: '教育(学習 / トレーニング / 知識共有 等)',
  FINANCE: '金融(家計簿 / 投資 / 決済 / 暗号資産 等)',
  HEALTH: 'ヘルスケア(フィットネス / 医療 / メンタル 等)',
  COMMERCE: 'コマース(EC / マーケットプレイス / SaaS 課金基盤 等)',
  SOCIAL: 'ソーシャル(SNS / コミュニティ / マッチング 等)',
  DEVELOPER_TOOL: '開発者向けツール(CLI / ライブラリ / API サービス 等)',
  LIFESTYLE: 'ライフスタイル(家事 / 旅行 / 趣味 / 子育て 等)',
  OTHER: 'その他',
};

export const PRICING_TIER_PROMPT_LABEL: Record<PricingTier, string> = {
  FREE_ONLY: '完全無料',
  FREEMIUM_UNDER_1000: 'フリーミアム(有料プラン 〜¥1,000)',
  FREEMIUM_1000_3000: 'フリーミアム(有料プラン ¥1,000〜¥3,000)',
  FREEMIUM_OVER_3000: 'フリーミアム(有料プラン ¥3,000〜)',
  PAID_UNDER_1000: '有料のみ(〜¥1,000)',
  PAID_1000_3000: '有料のみ(¥1,000〜¥3,000)',
  PAID_OVER_3000: '有料のみ(¥3,000〜)',
  USAGE_BASED: '従量課金',
  AD_SUPPORTED: '広告型',
  DONATION: '寄付・スポンサー',
};

/**
 * 構造化フィールド(categoryDomain + pricingTier)を AI prompt 用の日本語ブロックに整形する。
 * Service の `gatherContext` から呼ばれて user prompt に注入される。
 */
export function formatStructuredBriefForPrompt(brief: {
  categoryDomain?: string | null;
  pricingTier?: string | null;
}): string {
  const lines: string[] = [];
  if (
    brief.categoryDomain &&
    (CATEGORY_DOMAINS as readonly string[]).includes(brief.categoryDomain)
  ) {
    lines.push(
      `- ドメイン分類: ${CATEGORY_DOMAIN_PROMPT_LABEL[brief.categoryDomain as CategoryDomain]}`,
    );
  }
  if (brief.pricingTier && (PRICING_TIERS as readonly string[]).includes(brief.pricingTier)) {
    lines.push(`- 課金モデル: ${PRICING_TIER_PROMPT_LABEL[brief.pricingTier as PricingTier]}`);
  }
  return lines.join('\n');
}

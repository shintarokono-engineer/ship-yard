/**
 * AI 関連の調整可能な設定値。変更されうるマジックナンバー(モデル ID / 上限 / 単価 / 為替 / 対応種別)をここに集約する。
 * 料金改定・モデル更新・上限変更・対応ドキュメント種別の追加が必要になったらこのファイルだけ直す。
 */

import { DocType } from '@shipyard/db';

/** 品質要件が高い場面(競合調査 / ドキュメント生成 / RAG QA)で使う Claude モデル(ADR-005)。 */
export const AI_MODEL_SONNET = 'claude-sonnet-4-6';

/** 構造化中心の場面(タスク分解 / チェックリスト生成 / 文章推敲)で使う Claude モデル(ADR-005)。 */
export const AI_MODEL_HAIKU = 'claude-haiku-4-5-20251001';

/** RAG 用の埋め込みモデル(text-embedding-3-small、1536 次元、ADR-005)。 */
export const EMBEDDING_MODEL = 'text-embedding-3-small';

/** Free プランの 1 ヶ月あたり AI 呼び出し上限(ADR-004 / ADR-005)。 */
export const FREE_MONTHLY_AI_LIMIT = 20;

/** AI コスト見積用の為替レート(円/USD)。MVP 用の固定値。将来は日次更新 or 設定値にする(TODO)。 */
export const USD_PER_JPY = 150;

/**
 * モデル別の USD 単価(100 万トークンあたり [入力, 出力] ドル)。概算値、料金改定時に更新する。
 * 出典: Anthropic / OpenAI の公開価格(2026 年初時点の目安)。
 */
export const MODEL_PRICING_USD_PER_MTOK: Record<string, { in: number; out: number }> = {
  [AI_MODEL_SONNET]: { in: 3, out: 15 },
  [AI_MODEL_HAIKU]: { in: 1, out: 5 },
  [EMBEDDING_MODEL]: { in: 0.02, out: 0 },
};

/** 未知モデルのフォールバック単価(Sonnet 相当)。 */
export const FALLBACK_PRICING_USD_PER_MTOK = { in: 3, out: 15 };

/** AI 生成(DRAFT_GEN)に対応している ProjectDocument の種別。対応種別を増やすときはここに足す(DTO の `@IsIn` もこれを参照)。 */
export const GENERATABLE_DOC_TYPES = [DocType.README, DocType.LANDING_PAGE] as const;

/** AI 生成に対応している DocType のユニオン型(= `GENERATABLE_DOC_TYPES` の要素型)。 */
export type DocKind = (typeof GENERATABLE_DOC_TYPES)[number];

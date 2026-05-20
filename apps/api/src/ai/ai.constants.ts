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

/** AI 生成(DRAFT_GEN)に対応している ProjectDocument の種別。`OTHER` 以外の全種別。対応種別を増やすときはここに足す(DTO の `@IsIn` もこれを参照)。 */
export const GENERATABLE_DOC_TYPES = [
  DocType.README,
  DocType.LANDING_PAGE,
  DocType.RELEASE_BLOG,
  DocType.TWEET,
  DocType.PRODUCT_HUNT,
  DocType.EMAIL,
] as const;

/** AI 生成に対応している DocType のユニオン型(= `GENERATABLE_DOC_TYPES` の要素型)。 */
export type DocKind = (typeof GENERATABLE_DOC_TYPES)[number];

/** CHECKLIST_GEN で 1 回の生成で出力できる ChecklistItem の最大数。Tool 入力スキーマの `maxItems` にも反映する。 */
export const CHECKLIST_GEN_MAX_ITEMS = 30;

/** CHECKLIST_GEN の Anthropic API `max_tokens`。30 件 × 平均 80 トークン + 余裕 ≈ 4000。 */
export const CHECKLIST_GEN_MAX_TOKENS = 4096;

/** TASK_SPLIT で 1 回の分解で出力できるサブタスクの最大数。Tool 入力スキーマの `maxItems` にも反映する。 */
export const TASK_SPLIT_MAX_ITEMS = 10;

/** TASK_SPLIT の Anthropic API `max_tokens`。10 件 × 平均 80 トークン + 余裕 ≈ 2000。 */
export const TASK_SPLIT_MAX_TOKENS = 2048;

/**
 * RAG 検索で取得する類似ドキュメントの上限件数。
 *
 * 5 件 × `RAG_CONTENT_TRUNCATE_CHARS`(800)≈ 2000 tokens は Sonnet 4 の context window
 * 200K に対して 1% 未満、入力コストも約 1 円/回で誤差レベル。ノイズ対策は件数削減より
 * `distance` 閾値による選別の方が本筋(MVP 後に検討)。
 */
export const RAG_TOP_K = 5;

/** RAG_QA(壁打ち)の Anthropic API `max_tokens`(ADR-005 Day 27 改訂)。1 回答 1000 トークン強 + 余裕 ≒ 2048。 */
export const RAG_QA_MAX_TOKENS = 2048;

/**
 * RAG_QA で 1 リクエスト時に context に積む直近ターン数の上限(ADR-005 Day 27 改訂)。
 * 1 ターン = user + assistant の 2 メッセージなので DB 取得時は `MAX_TURNS * 2` 件取る。
 * v1.x で N > 10 ターン時の前段要約方式に置換予定。
 */
export const RAG_QA_MAX_TURNS = 10;

/** RAG_QA の 1 メッセージあたり content 最大文字数(ADR-005 Day 27 改訂、DTO バリデーションで強制)。 */
export const RAG_QA_MAX_MESSAGE_LENGTH = 8000;

/** RAG_QA の 1 セッションあたり最大メッセージ数(ADR-005 Day 27 改訂、暴走防止)。超過時は新規セッション作成を促す。 */
export const RAG_QA_MAX_MESSAGES_PER_SESSION = 100;

/** RAG context として LLM に渡す各ドキュメントの本文切り詰め文字数(prompt 圧迫対策)。 */
export const RAG_CONTENT_TRUNCATE_CHARS = 800;

/**
 * 運営キュレーション seed コーパスを保持する特別なテナント ID(ADR-008、migration 20260519160000)。
 *
 * 全テナントの RAG 検索は「自テナント + この seed テナント」を OR で対象にする。
 * これは ADR-002 Pool model の例外で、ADR-008 で明示的に許可されている(運営所有 + オープン
 * ライセンスコーパスのみ、ユーザーのプライベートデータは決して横断しない)。
 *
 * 値は migration 側と一致させる必要があるためハードコード。将来環境ごとに変える必要が出たら
 * `ConfigService` 経由に切り替える(現状は本番 / 開発で同じ値で運用)。
 */
export const SEED_PUBLIC_TENANT_ID = 'SEED_PUBLIC';

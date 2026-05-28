/**
 * AI 関連の調整可能な設定値。変更されうるマジックナンバー(モデル ID / 上限 / 単価 / 為替 / 対応種別)をここに集約する。
 * 料金改定・モデル更新・上限変更・対応ドキュメント種別の追加が必要になったらこのファイルだけ直す。
 */

import { DocType, Plan } from '@shipyard/db';

/** 品質要件が高い場面(競合調査 / ドキュメント生成 / RAG QA)で使う Claude モデル(ADR-005)。 */
export const AI_MODEL_SONNET = 'claude-sonnet-4-6';

/** 構造化中心の場面(タスク分解 / チェックリスト生成 / 文章推敲)で使う Claude モデル(ADR-005)。 */
export const AI_MODEL_HAIKU = 'claude-haiku-4-5-20251001';

/** RAG 用の埋め込みモデル(text-embedding-3-small、1536 次元、ADR-005)。 */
export const EMBEDDING_MODEL = 'text-embedding-3-small';

/**
 * モデル別の AI クレジット重み付け(ADR-012)。
 * 実コスト比(Sonnet 4 ≒ 3 × Haiku 4.5)に対応。
 * `Feature.OTHER`(embedding 等の裏方)は呼び出し側で 0 にする(下記 `creditsForUsage` 参照)。
 */
export const MODEL_CREDITS: Record<string, number> = {
  [AI_MODEL_HAIKU]: 1,
  [AI_MODEL_SONNET]: 3,
  [EMBEDDING_MODEL]: 0,
};

/** 未知モデルのフォールバック cr(Sonnet 相当)。新モデル追加忘れの安全網。 */
export const FALLBACK_MODEL_CREDITS = 3;

/** Team プランの 1 seat(メンバー)あたり月次クレジット上限(ADR-012)。共有プールで `seats × 800 cr` が上限。 */
export const TEAM_CREDITS_PER_SEAT = 800;

/**
 * プラン別の月次クレジット上限(ADR-012)。
 * - FREE: 0(トライアル終了後の AI 停止状態、常に AI 機能を拒否する)
 * - PRO:  300 cr/月(Sonnet 4 ≒ 100 回 / Haiku 4.5 ≒ 300 回 相当)
 * - TEAM: 動的(seats × `TEAM_CREDITS_PER_SEAT`)— Service 側で seat 数を引いて計算する
 */
export const PLAN_CREDIT_LIMITS: Record<Plan, number | null> = {
  [Plan.FREE]: 0,
  [Plan.PRO]: 300,
  [Plan.TEAM]: null,
};

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

/**
 * AI 生成(DRAFT_GEN)に対応している ProjectDocument の種別。
 * `OTHER` を除く 5 種(LP は §9.12.1 で `DocType` 自体から削除済、
 * ADR-009 の `LandingPage` テーブル + `submit_landing_page` ブロック生成に移行)。
 * 対応種別を増やすときはここに足す(DTO の `@IsIn` もこれを参照)。
 */
export const GENERATABLE_DOC_TYPES = [
  DocType.README,
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

/**
 * PRODUCT_DIAGNOSIS(プロダクト診断、ADR-013)の Anthropic API `max_tokens`。
 * 競合 5 件 × 約 300 文字 + 5 軸 × 約 200 文字 + 改善提案 5 件 × 約 500 文字 ≒ 3000 文字 + 余裕。
 */
export const PRODUCT_DIAGNOSIS_MAX_TOKENS = 4096;

/**
 * PRODUCT_DIAGNOSIS の Anthropic API `temperature`(ADR-013)。
 * デフォルト 1.0 だとスコアのブレが ±10 点になるため、0.2 で ±3 程度に収束させる(再現性確保)。
 */
export const PRODUCT_DIAGNOSIS_TEMPERATURE = 0.2;

/**
 * PRODUCT_DIAGNOSIS の Pro / Team / トライアル中の月次実行回数上限(ADR-013、MVP の暴走防止枠)。
 *
 * 1 回 5〜15 円(Sonnet 4 + Web Search Tool)× 50 ≒ 月 750 円が Pro ARPU(¥1,480、ADR-012)の
 * 現実的天井。v1.0.1 で AI クレジット制(3 cr/回)に移行する際は本定数を削除し、`AIUsage.credits`
 * ベースのチェックに置き換える(ADR-012 §段階的実装と同期)。
 *
 * Free フォールバック状態(ADR-012、AI 機能停止)は本機能の実行自体を 403 で弾くため
 * 月次上限の対象外(`assertWithinDiagnosisQuota` で先に弾く)。
 */
export const PRODUCT_DIAGNOSIS_MAX_PER_MONTH_PRO = 50;

/**
 * IDEA_VALIDATION(アイデア検証、ADR-013 改訂版)の Anthropic API `max_tokens`。
 * PRODUCT_DIAGNOSIS と同設計(5 軸 × 各 200 文字 + 改善提案 5 件 × 各 500 文字 + 競合 5 件 × 各 300 文字 + 余裕)。
 */
export const IDEA_VALIDATION_MAX_TOKENS = 4096;

/**
 * IDEA_VALIDATION の Anthropic API `temperature`(ADR-013 改訂版)。
 * デフォルト 1.0 だとスコアのブレが大きいため、PRODUCT_DIAGNOSIS と同じく 0.2 に固定。
 */
export const IDEA_VALIDATION_TEMPERATURE = 0.2;

/**
 * IDEA_VALIDATION の Pro / Team / トライアル中の月次実行回数上限(ADR-013 改訂版、MVP の暴走防止枠)。
 *
 * アイデア検証は「発案 → Pivot 検討 → 再検証」 のループを想定するため、PRODUCT_DIAGNOSIS よりやや
 * 多めの 30 回/月。1 回 5〜15 円 × 30 ≒ 月 450 円が Pro ARPU(¥1,480、ADR-012)に収まる水準。
 * v1.0.1 で AI クレジット制(3 cr/回)に移行する際は本定数を削除し、`AIUsage.credits` ベースの
 * チェックに置き換える(ADR-012 §段階的実装と同期)。
 *
 * Free フォールバック状態は本機能の実行自体を 403 で弾くため月次上限の対象外。
 */
export const IDEA_VALIDATION_MAX_PER_MONTH_PRO = 30;

/**
 * Anthropic server-side Web Search Tool の type 名(ADR-013、PRODUCT_DIAGNOSIS / IDEA_VALIDATION で使用)。
 *
 * Anthropic 公式ドキュメント(docs.claude.com、2026-02 時点)で確認した正式 type 名。
 * 採用バージョン:`web_search_20250305`(標準版、動的フィルタリングなし)。
 *
 * 別バージョン `web_search_20260209`(動的フィルタリング対応)は code_execution tool の有効化が必須で、
 * モデルも Claude Mythos / Opus 4.7・4.6 / Sonnet 4.6 限定。MVP では標準版で必要十分のため不採用。
 * v1.x で診断品質改善が必要になったら 20260209 への切替を検討。
 */
export const WEB_SEARCH_TOOL_TYPE = 'web_search_20250305';

/** Web Search Tool の `name`(両バージョン共通、Anthropic 公式)。 */
export const WEB_SEARCH_TOOL_NAME = 'web_search';

/**
 * Web Search Tool の `max_uses`(PRODUCT_DIAGNOSIS / IDEA_VALIDATION の競合 3-5 件取得想定で 5 回まで)。
 * Anthropic の Web Search は $10 / 1000 searches なので、5 回でも 1 回あたり最大 $0.05 ≒ 7.5 円。
 */
export const WEB_SEARCH_MAX_USES = 5;

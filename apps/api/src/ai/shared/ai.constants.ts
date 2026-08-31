/**
 * AI 関連の調整可能な設定値。変更されうるマジックナンバー(モデル ID / 上限 / 単価 / 為替 / 対応種別)をここに集約する。
 * 料金改定・モデル更新・上限変更・対応ドキュメント種別の追加が必要になったらこのファイルだけ直す。
 */

import { DocType, Feature, Plan } from '@shipyard/db';

// モデル ID の命名不揃い(Sonnet は日付サフィックスなしのエイリアス、Haiku は固定版)は意図的:
// Sonnet はマイナー改訂を自動追従するエイリアス運用、Haiku は再現性重視で版固定。料金/挙動更新時はここだけ直す。

/** 品質要件が高い場面(競合調査 / ドキュメント生成 / RAG QA)で使う Claude モデル(ADR-005)。 */
export const AI_MODEL_SONNET = 'claude-sonnet-4-6';

/** 構造化中心の場面(タスク分解 / チェックリスト生成 / 文章推敲)で使う Claude モデル(ADR-005)。 */
export const AI_MODEL_HAIKU = 'claude-haiku-4-5-20251001';

/** RAG 用の埋め込みモデル(text-embedding-3-small、1536 次元、ADR-005)。 */
export const EMBEDDING_MODEL = 'text-embedding-3-small';

/**
 * Anthropic API リクエストのタイムアウト(ms)。SDK 既定(約 10 分)だとプロバイダ障害時に
 * 同期ハンドラが長時間張り付くため明示的に上限を設ける。PRODUCT_DIAGNOSIS / IDEA_VALIDATION は
 * Web Search Tool(最大 5 回)で長時間化しうるため、切り詰めすぎて正常系を落とさないよう 180 秒に取る。
 */
export const ANTHROPIC_REQUEST_TIMEOUT_MS = 180_000;

/** OpenAI(embedding 専用)のタイムアウト(ms)。埋め込みは軽量なので短めで十分。 */
export const OPENAI_REQUEST_TIMEOUT_MS = 30_000;

/** AI プロバイダ呼び出しのリトライ回数(SDK 既定と同値だが明示する)。 */
export const AI_MAX_RETRIES = 2;

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

/**
 * Feature 別の AI クレジット上書き(ADR-012 v1.0.1 / ADR-014)。
 *
 * 既定は `MODEL_CREDITS[model]`(Sonnet=3 / Haiku=1)で決まるが、Tool Use のオーバーヘッドや
 * Web Search 等で実コストがモデル基準と乖離する Feature はここで明示的に上書きする。
 * 未登録の Feature は `MODEL_CREDITS` 値をそのまま使う(`creditsForUsage` 参照)。
 *
 * MVP では `assertWithin*Quota` の月次回数制で実質制御するため、本値は AIUsage 記録上の参考値に
 * 留まるが、v1.0.1 で credit ベース制御に切り替える際に即時反映される。
 */
export const FEATURE_CREDIT_OVERRIDES: Partial<Record<Feature, number>> = {
  // ADR-014:Sonnet 4 + Tool Use で Twitter + Blog をマルチチャネル一括生成、max_tokens 3072 + tool 呼び出しオーバーヘッド
  [Feature.ANNOUNCEMENT_GEN]: 4,

  // ADR-016 / F23:Web Search + 2-step で実コストがモデル基準から大きく乖離するため固定する。
  //
  // **値は turnCount(= 2)に掛かるので 5 = 10cr。** ここを空けておくと `MODEL_CREDITS` から
  // 自動計算され、turn 1 を Haiku にした結果 4cr に下がってしまう。そうなると Pro の 300cr で
  // 回せる回数が 50 → 75 に増え、**実費を半減させた分がそのまま回数増で相殺される**。
  // 支出の天井を決めているのは実費ではなくクレジット価格なので、モデル式から切り離して固定する。
  //
  // 根拠(2026-08-30 実測 + Haiku 化後の試算):
  //   実費 約 ¥26.6 / 回(モデル ¥20.6 + Web Search ¥6)
  //   10cr なら 300cr = 月 30 回 → 最悪支出 ¥798、単価 ¥2.66/cr
  //   ¥4.93/cr(= ¥1,480 ÷ 300cr)は売上を全額 AI に使う前提で甘い。Stripe(約 ¥53)と
  //   インフラ(月 $38 の頭割り)を引くと、初期の人数では実質 ¥3/cr 前後が上限。
  [Feature.PRODUCT_DIAGNOSIS]: 5,
  [Feature.IDEA_VALIDATION]: 5,
};

/**
 * `AiJob` が RUNNING のまま放置されたときに「取り残し」 と判定するまでの時間(ms、ADR-016)。
 *
 * App Runner の再起動やデプロイで背景処理ごと消えても `status` は RUNNING のまま残るため、
 * ポーリングの読み取り時にこの時間を超えていたら FAILED に倒す。
 *
 * 値は「正常系が絶対に超えない下限」 から決める。2-step の各ターンは `ANTHROPIC_REQUEST_TIMEOUT_MS`
 * (180 秒)が上限で、リトライ `AI_MAX_RETRIES`(2)を含めても最悪 180 × 2 ターン × 3 回 = 18 分。
 * 実測は 88〜153 秒なので、余裕を取って 20 分とする。短すぎると正常な処理を失敗扱いにする。
 */
export const AI_JOB_STALE_MS = 20 * 60 * 1000;

/**
 * 履歴一覧に失敗ジョブを出し続ける期間(ms、ADR-016)。
 *
 * 古い失敗が残り続けても行動につながらないので絞るが、「実行したのに結果が無い。
 * クレジットはどうなったのか」 を後から確認できる必要があるため、一晩越しでも見える 24 時間とする。
 */
export const AI_JOB_RECENT_FAILURE_MS = 24 * 60 * 60 * 1000;

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
 * MVP では `README` のみ。
 *   - LP は §9.12.1 で `DocType` から削除済(ADR-009 の `LandingPage` テーブル + `submit_landing_page` ブロック生成に移行)。
 *   - 告知文(RELEASE_BLOG / TWEET / PRODUCT_HUNT / EMAIL)は §9.12.3 で `DocType` から削除済
 *     (ADR-014 の `Feature.ANNOUNCEMENT_GEN` = Sonnet 4 + Tool Use でマルチチャネル一括生成に移行)。
 * 対応種別を増やすときはここに足す(DTO の `@IsIn` もこれを参照)。
 */
export const GENERATABLE_DOC_TYPES = [DocType.README] as const;

/** AI 生成に対応している DocType のユニオン型(= `GENERATABLE_DOC_TYPES` の要素型)。 */
export type DocKind = (typeof GENERATABLE_DOC_TYPES)[number];

/**
 * AI 機能の DTO が受け取る追加指示の最大文字数。
 * FE 側 `ai-form.ts` の `INSTRUCTIONS_MAX_LENGTH` と手動同期が必要(型では担保できない)。
 */
export const AI_INSTRUCTIONS_MAX_LENGTH = 2000;

/** CHECKLIST_GEN で 1 回の生成で出力できる ChecklistItem の最大数。Tool 入力スキーマの `maxItems` にも反映する。 */
export const CHECKLIST_GEN_MAX_ITEMS = 30;

/** CHECKLIST_GEN の Anthropic API `max_tokens`。30 件 × 平均 80 トークン + 余裕 ≈ 4000。 */
export const CHECKLIST_GEN_MAX_TOKENS = 4096;

/** TASK_SPLIT で 1 回の分解で出力できるサブタスクの最大数。Tool 入力スキーマの `maxItems` にも反映する。 */
export const TASK_SPLIT_MAX_ITEMS = 10;

/** TASK_SPLIT の Anthropic API `max_tokens`。10 件 × 平均 80 トークン + 余裕 ≈ 2000。 */
export const TASK_SPLIT_MAX_TOKENS = 2048;

/**
 * F17(改善提案 → ChecklistItem 変換)で 1 回に出力できる項目の最大数。
 *
 * 入力は提案 3〜5 件で、1 提案あたり実質 2〜3 タスクに分かれる想定なので 6〜15 件が目安。
 * CHECKLIST_GEN と同じ 30 にすると「1 提案 6 タスク」まで許してしまい、粒度が細かすぎて
 * かえって使えないリストになる。12 に抑えることで AI 側に優先順位付けを強制する。
 */
export const SUGGESTION_TASKS_MAX_ITEMS = 12;

/** F17 の Anthropic API `max_tokens`。12 件 × 平均 80 トークン + 余裕 ≈ 2000(TASK_SPLIT と同じ計算)。 */
export const SUGGESTION_TASKS_MAX_TOKENS = 2048;

/**
 * F17 のプロンプトに載せる既存 ChecklistItem の最大件数。
 *
 * 重複生成を避けるため既存項目の title を渡すが、全件入れるとプロジェクトによっては
 * 数百件になりトークンを圧迫する。先頭 50 件(= position 順の若い方)で足りる。
 */
export const SUGGESTION_TASKS_EXISTING_TITLES_MAX = 50;

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

/**
 * 壁打ちセッションの要約で対象にする直近ターン数の上限。
 * 12 ターン × `SESSION_SUMMARY_MESSAGE_TRUNCATE_CHARS` ≒ 13k tokens で、実測 ¥1.6〜2.2/回。
 * 上げるときは実費を測ってから(3cr の損益分岐は ¥14.8)。
 */
export const SESSION_SUMMARY_MAX_TURNS = 12;

/** 壁打ちの要約で 1 メッセージあたりプロンプトに載せる最大文字数(`RAG_QA_MAX_MESSAGE_LENGTH` は 8,000)。 */
export const SESSION_SUMMARY_MESSAGE_TRUNCATE_CHARS = 800;

/** 壁打ちの要約の Anthropic API `max_tokens`。 */
export const SESSION_SUMMARY_MAX_TOKENS = 2048;

/**
 * 壁打ちの要約が出力する description の最大文字数。
 * `UpdateProjectDto` の上限は 20,000 字だが、長い概要は下流機能の入力を圧迫するため生成側で抑える。
 */
export const SESSION_SUMMARY_MAX_CHARS = 2000;

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
 * 採用バージョン:`web_search_20250305`(標準版、動的フィルタリングなし)。
 *
 * **`web_search_20260209`(動的フィルタリング版)は 2026-08-30 に実測して不採用に戻した。**
 * コスト削減を狙って切り替えたが、逆に悪化した(同一プロジェクトで比較):
 *
 * |            | 20250305(08-29) | 20260209(08-30) |
 * | ---------- | ---------------- | ---------------- |
 * | tokensIn   | 67,831           | **141,632**      |
 * | costJpy    | ¥41.65           | **¥79.03**       |
 * | 所要時間   | 53〜113 秒       | **153 秒**       |
 *
 * 原因は本機能の 2-step 構成。turn 2 が `{ role: 'assistant', content: turn1.content }` で
 * **turn 1 の内容を丸ごと再送する**ため、動的フィルタリングが内部の code execution で増やした
 * ブロックが turn 2 の入力として二重に乗る。フィルタリングの節約分を再送が食い潰す。
 * さらに 153 秒は FE の `API_TIMEOUT_MS = 55_000`(`apps/web/src/lib/api/client.ts`)を超えるため、
 * **UI からは 504 で失敗する**。
 *
 * 再挑戦するなら、先に turn 2 へ渡す内容を turn 1 の最終テキストだけに絞る改修が必要。
 * その際の注意: `tools` に `code_execution` を併記してはいけない(動的フィルタリングは内部で
 * 実行するため別途宣言は不要。宣言すると実行環境が二重になりモデルが混乱する)。ベータヘッダも不要。
 * 対応モデルは Opus 4.6 以降 / Sonnet 4.6 以降で、現行の `AI_MODEL_SONNET` は該当する。
 */
export const WEB_SEARCH_TOOL_TYPE = 'web_search_20250305';

/** Web Search Tool の `name`(両バージョン共通、Anthropic 公式)。 */
export const WEB_SEARCH_TOOL_NAME = 'web_search';

/**
 * Web Search Tool の `max_uses`(PRODUCT_DIAGNOSIS / IDEA_VALIDATION の競合 3-5 件取得想定で 5 回まで)。
 * Anthropic の Web Search は $10 / 1000 searches なので、5 回でも 1 回あたり最大 $0.05 ≒ 7.5 円。
 *
 * **意図的に 5 のまま**(ADR-016)。下げれば検索料金と結果トークンが減るが、失われるのは
 * 「クエリを言い換えて再挑戦する余地」 で、ニッチなプロダクトほど競合を拾えなくなる。
 * 影響するのは `competitiveAdvantage` / `marketPotential` = 本機能の差別化価値そのもの。
 * 動的フィルタリング(`WEB_SEARCH_TOOL_TYPE`)の削減幅をまず実測し、それでも損益分岐
 * (¥4.93/cr × 6cr = ¥29.6 / 回)を超える場合に限り、5 → 3 と 1 段ずつ下げて競合取得数を確認する。
 */
export const WEB_SEARCH_MAX_USES = 5;

/** DRAFT_GEN(ドキュメント初稿生成)の Anthropic API `max_tokens`。README 全文 + Tool Use 余裕 ≒ 4096。 */
export const DRAFT_GEN_MAX_TOKENS = 4096;

/** REFINE_DOC(ドキュメント推敲)の Anthropic API `max_tokens`。推敲後本文 + Tool Use 余裕 ≒ 4096。 */
export const REFINE_DOC_MAX_TOKENS = 4096;

/** ANNOUNCEMENT_GEN の Anthropic API `max_tokens`(Twitter 100 tok + Blog 2500 tok + 余裕、ADR-014)。 */
export const ANNOUNCEMENT_GEN_MAX_TOKENS = 3072;

/** ANNOUNCEMENT_GEN の `temperature`(訴求文のバリエーション重視、DRAFT_GEN と同等、ADR-014)。 */
export const ANNOUNCEMENT_GEN_TEMPERATURE = 0.7;

/**
 * ANNOUNCEMENT_GEN の Pro / Team / トライアル中の月次実行回数上限(ADR-014、MVP の暴走防止枠)。
 *
 * 1 回 4〜6 円(Sonnet 4 + Tool Use)× 50 回 ≒ 月 300 円が Pro ARPU(¥1,480、ADR-012)に収まる水準。
 * v1.0.1 で AI クレジット制(4 cr/回、`FEATURE_CREDIT_OVERRIDES` 参照)に移行する際は本定数を削除し、
 * `AIUsage.credits` ベースのチェックに置き換える(ADR-012 §段階的実装と同期)。
 *
 * Free フォールバック状態は本機能の実行自体を 403 で弾くため月次上限の対象外。
 */
export const ANNOUNCEMENT_MAX_PER_MONTH_PRO = 50;

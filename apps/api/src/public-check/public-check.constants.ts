/**
 * 無料公開版 `/check`(ADR-015)の定数。値は `.claude/output/measurements/2026-09-01-public-check-tokens.md` の実測に基づく。
 *
 * プロンプトを変えるとトークン量が変わる。本番の `PublicIdeaCheck.tokensOut` / `costJpy` で実費を確認し直すこと。
 */

/**
 * 日次グローバル上限(回 / 日)。**費用の天井の主防御**。
 *
 * ワーストケース 約 ¥3.0 / 回 で最悪 ¥90 / 日(約 ¥2,700 / 月)。平均実費 ¥1.82 なら約 ¥1,650 / 月。
 * 恒常的に到達するようなら ADR-015 の見直しトリガーになる。
 */
export const PUBLIC_CHECK_DAILY_LIMIT = 30;

/**
 * 同一 IP ハッシュからの実行回数の上限と、その窓(分)。**補助層**。
 *
 * クライアント IP は明示ヘッダで渡すしかなく偽装できるため、主防御にはできない。
 */
export const PUBLIC_CHECK_IP_RATE_LIMIT = 5;
export const PUBLIC_CHECK_IP_RATE_WINDOW_MINUTES = 60;

/**
 * 入力アイデア文の文字数の下限と上限。
 *
 * 下限は採点が成立する最低限の長さで、これ未満は AI を呼ぶ前に弾く(日次枠を無駄に消費させない)。
 * 上限は実測 0.9 tok / 字 で 2,000 字でも入力コストが ¥0.73 にしかならないため、
 * 費用対策ではなく極端な入力を弾くために置いている。FE の `check-form.ts` と揃えること。
 */
export const PUBLIC_CHECK_INPUT_MIN_CHARS = 20;
export const PUBLIC_CHECK_INPUT_MAX_CHARS = 2000;

/**
 * 出力の上限トークン。**ワーストケースの実費を決めているのはこの値**($5/MTok × 3,072 = ¥2.30)。
 *
 * 実測の最大が 2,131 トークン(切られたものは無し)。44% の余裕を持たせた頭打ち。
 */
export const PUBLIC_CHECK_MAX_TOKENS = 3072;

/** 採点の温度。有料版(`IDEA_VALIDATION_TEMPERATURE`)と揃える。 */
export const PUBLIC_CHECK_TEMPERATURE = 0.2;

// 100 点満点への正規化係数はここに置かない。正規化は表示層だけの仕事で、API は内部値
// (0〜60)しか扱わない。係数は `apps/web/src/lib/api/types.ts` の `PUBLIC_CHECK_SCORE_SCALE`。

/** 結果 ID のバイト長。`randomBytes(16).toString('base64url')` で 22 文字になる。 */
export const PUBLIC_CHECK_ID_BYTES = 16;

/**
 * 未共有の結果を保持する日数。これを過ぎたものは日次バッチで削除する。
 *
 * `sharedAt` が立っているものは対象外。claim 済みは対象に含む(アイデア文は Project へ複製済み)。
 */
export const PUBLIC_CHECK_RETENTION_DAYS = 30;

/** `ipHash` を null にするまでの時間。レート制限の窓を過ぎたら保持する理由が無くなる。 */
export const PUBLIC_CHECK_IP_HASH_RETENTION_HOURS = 24;

/**
 * 持ち越しで自動作成するワークスペースの名前。
 *
 * slug は `WorkspacesService.generateUniqueSlug` が導出する(日本語名は slugify が空になるため、
 * 同メソッドのランダムフォールバックが効く)。設定画面から改名できる。
 */
export const PUBLIC_CHECK_WORKSPACE_NAME = 'マイワークスペース';

/**
 * 途中で落ちた claim を取り残しとみなすまでの時間(分)。
 *
 * `claimedAt` を立ててから `claimedByTenantId` を書くまでにプロセスが落ちると、誰も引き換えられない
 * 行が残る。この時間を過ぎた未完了の claim は取り直せるようにする(ADR-017 の取り残し判定と同じ考え方)。
 */
export const PUBLIC_CHECK_CLAIM_STALE_MINUTES = 10;

/** 自動作成するプロジェクト名の最大長。アイデア文の 1 行目から切り出す。 */
export const PUBLIC_CHECK_PROJECT_NAME_MAX_CHARS = 40;

/** アイデア文の 1 行目が空だった場合のプロジェクト名。 */
export const PUBLIC_CHECK_PROJECT_NAME_FALLBACK = '検証中のアイデア';

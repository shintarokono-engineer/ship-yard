/**
 * 内部ジョブ(F20 トライアル終了通知 / 将来の F15 Reconciliation)の定数。
 * マジックナンバーを散らさないため、閾値はすべてここに集約する。
 */

/**
 * 「3 日前通知」として拾う JST 日付差の上限。
 * 日差 3 ちょうどだけを対象にするとバッチが 1 日落ちた日の分を永久に取りこぼすため、
 * 1〜3 の幅を持たせて未送信なら翌日以降でも送れるようにする。
 */
export const THREE_DAYS_MAX_DIFF = 3;

/**
 * 候補抽出の上限(日)。日差 3(最大 約 84 時間先)を確実に含む余裕を持たせた値。
 * これを超える終了日時は DB クエリの時点で除外する。
 */
export const CANDIDATE_WINDOW_DAYS = 4;

/** 内部ジョブエンドポイントの認証ヘッダ名(Express は小文字で受け取る)。 */
export const INTERNAL_JOB_TOKEN_HEADER = 'x-internal-job-token';

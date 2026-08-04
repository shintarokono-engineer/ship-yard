/**
 * apps/api 由来のエラーを表すクラス。
 *
 * - `status` … HTTP ステータス(401/403/404/4xx/5xx)。fetch 失敗(ネットワーク)時は 0
 * - `body` … API が返した JSON ボディ(`{ statusCode, message, error }` 等)。パース失敗時は null
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown = null,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** 401 / 403 / 404 等の判定ヘルパー。 */
export function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError;
}

/** NestJS の `BadRequestException` が返す `message` 配列を文字列にまとめる。 */
export function extractValidationMessages(body: unknown): string[] {
  if (!body || typeof body !== 'object') return [];
  const message = (body as { message?: unknown }).message;
  if (Array.isArray(message)) return message.filter((m): m is string => typeof m === 'string');
  if (typeof message === 'string') return [message];
  return [];
}

/**
 * セッション切れ(API が 401)を表す例外。**404 と明確に区別するために存在する。**
 *
 * 以前は fetch 系ヘルパーが 401 も 404 と同じ `null` に潰しており、呼び出し側が
 * `notFound()` を呼ぶため **セッション切れが「ページが存在しません」として表示**されていた。
 *
 * 2026-08-04 の本番疎通テストで実際に踏んだ: LP の AI 再生成(10〜20 秒)の間に Clerk の
 * セッショントークン(既定 60 秒)が期限切れになり、`revalidatePath` 後の再取得が 401 →
 * `fetchWorkspace` が null → `notFound()` → **生成は成功しているのに 404 画面**。
 * リロードすれば直るため、ユーザーには「生成したらページが消えた」としか見えない。
 *
 * 診断・アイデア検証など所要時間の長い機能ほど踏みやすいので、401 は潰さず投げて
 * error boundary で「セッションが切れました」と案内する。
 */
export class SessionExpiredError extends Error {
  constructor() {
    super('セッションの有効期限が切れました。ページを再読み込みしてください。');
    this.name = 'SessionExpiredError';
  }
}

/**
 * 「404 なら null、401 ならセッション切れとして throw」を 1 箇所に集約するヘルパー。
 *
 * 各 fetch ヘルパーが個別に `e.status === 404 || e.status === 401` と書いていると、
 * 片方だけ直す / 新しい fetch で同じ混同を再発させる、という事故が起きる。
 *
 * @example
 * export const fetchWorkspace = cache(async (slug: string) => {
 *   try {
 *     return await apiFetch<Workspace>(`/workspaces/${encodeURIComponent(slug)}`);
 *   } catch (e) {
 *     return nullOnNotFound(e);
 *   }
 * });
 */
export function nullOnNotFound(e: unknown): null {
  if (e instanceof ApiError && e.status === 401) throw new SessionExpiredError();
  if (e instanceof ApiError && e.status === 404) return null;
  throw e;
}

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

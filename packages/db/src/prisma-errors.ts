import { Prisma } from '@prisma/client';

/**
 * Prisma の既知エラーコード(公式 "Error message reference" より、本プロジェクトで判定に使うものだけ)。
 * Prisma の公開 API なので固定値だが、コード上はマジック文字列にせず名前で参照する。
 */
export const PrismaErrorCode = {
  /** 操作が依存するレコードが見つからなかった(update / delete の where が 0 件 等)。→ 404 にマップ。 */
  RECORD_NOT_FOUND: 'P2025',
  /** Unique 制約違反。→ 409、もしくはリトライ判定に使う。 */
  UNIQUE_VIOLATION: 'P2002',
} as const;

export type PrismaErrorCodeValue = (typeof PrismaErrorCode)[keyof typeof PrismaErrorCode];

/** `e` が指定コードの Prisma 既知エラー(`PrismaClientKnownRequestError`)かどうかを判定する型ガード。 */
export function isPrismaError(
  e: unknown,
  code: PrismaErrorCodeValue,
): e is Prisma.PrismaClientKnownRequestError {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === code;
}

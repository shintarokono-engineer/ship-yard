import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';

/**
 * cursor ベースのページング共通ユーティリティ。
 *
 * プロジェクト配下で時間とともに無制限に伸びる一覧(告知 / RAG_QA セッション等)の payload を
 * 常に有限に抑えるための仕組み。offset ページングと違い、行の挿入で行がズレない安定した継続取得ができる。
 *
 * 使い方(Service 側):
 *   const limit = resolveLimit(page.limit);
 *   const rows = await prisma.xxx.findMany({
 *     where: { tenantId, ... },
 *     orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], // 一意タイブレークを必ず添える
 *     ...cursorArgs(page.cursor, limit),
 *   });
 *   return toCursorPage(rows, limit);
 *
 * FE は `nextCursor` が非 null の間、それを `?cursor=` に渡して続きを取得する(無ければ最終ページ)。
 */

/** 未指定時のページサイズ。FE が limit を渡さなくてもこの件数で頭打ちになる。 */
export const DEFAULT_PAGE_SIZE = 50;

/** limit の上限。過大な limit 指定で payload が膨らむのを防ぐ。 */
export const MAX_PAGE_SIZE = 100;

/** cursor ページングの共通クエリ DTO(`@Query()` で受ける)。 */
export class CursorPaginationDto {
  /** 続きを取得する起点(前ページの `nextCursor` = 末尾行の id)。未指定なら先頭ページ。 */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  cursor?: string;

  /** 1 ページの最大件数(1〜`MAX_PAGE_SIZE`、未指定は `DEFAULT_PAGE_SIZE`)。 */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  limit?: number;
}

/** cursor ページ 1 枚分の戻り値。`nextCursor` が null なら最終ページ。 */
export interface CursorPage<T> {
  items: T[];
  /** 次ページの起点 id。続きが無ければ null。 */
  nextCursor: string | null;
}

/** limit を `[1, MAX_PAGE_SIZE]` に収める(未指定は `DEFAULT_PAGE_SIZE`)。 */
export function resolveLimit(limit?: number): number {
  if (limit === undefined) return DEFAULT_PAGE_SIZE;
  return Math.min(Math.max(1, limit), MAX_PAGE_SIZE);
}

/**
 * Prisma の findMany に渡す take / cursor / skip を組み立てる。
 * 「次ページの有無」を 1 クエリで判定するため `take = limit + 1`(1 件余分に取る)。
 * cursor 指定時はその行自身を除くため `skip: 1`。
 */
export function cursorArgs(
  cursor: string | undefined,
  limit: number,
): { take: number; cursor?: { id: string }; skip?: number } {
  return {
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  };
}

/**
 * `cursorArgs` で 1 件余分に取った行配列を、表示分(limit 件)と `nextCursor` に整形する。
 * 余分行があれば続きあり(末尾行の id を nextCursor に)、無ければ最終ページ(null)。
 */
export function toCursorPage<T extends { id: string }>(rows: T[], limit: number): CursorPage<T> {
  if (rows.length > limit) {
    const items = rows.slice(0, limit);
    return { items, nextCursor: items[items.length - 1]!.id };
  }
  return { items: rows, nextCursor: null };
}

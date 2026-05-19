import { IsIn } from 'class-validator';

import { Role } from '@shipyard/db';

/**
 * 変更可能なロール(`OWNER` 以外)。所有権譲渡は別 API として将来実装するため、
 * メンバー編集の経路では OWNER への昇格 / 降格を構造的に弾く(招待 DTO と同じ思想)。
 * `Role` enum に新規ロールを追加した際は、ここも更新する必要がある。
 */
const NON_OWNER_ROLES = [
  Role.ADMIN,
  Role.DEVELOPER,
  Role.REVIEWER,
  Role.TESTER,
  Role.VIEWER,
] as const;

/** `PATCH /workspaces/:slug/members/:userId` のリクエストボディ。 */
export class UpdateMemberRoleDto {
  /**
   * 新しいロール(OWNER 以外)。
   * `@IsIn` で OWNER を構造的に弾く(`@IsEnum(Role)` だと OWNER を許してしまう)。
   */
  @IsIn(NON_OWNER_ROLES)
  role!: (typeof NON_OWNER_ROLES)[number];
}

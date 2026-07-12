import { IsIn } from 'class-validator';

import { NON_OWNER_ROLES } from '../../auth/roles';

/** `PATCH /workspaces/:slug/members/:userId` のリクエストボディ。 */
export class UpdateMemberRoleDto {
  /**
   * 新しいロール(OWNER 以外)。
   * `@IsIn` で OWNER を構造的に弾く(`@IsEnum(Role)` だと OWNER を許してしまう)。
   */
  @IsIn(NON_OWNER_ROLES)
  role!: (typeof NON_OWNER_ROLES)[number];
}

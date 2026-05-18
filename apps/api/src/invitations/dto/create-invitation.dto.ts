import { IsEmail, IsIn } from 'class-validator';

import { Role } from '@shipyard/db';

/**
 * 招待時に付与できるロール。OWNER は除外(オーナーは元々 1 人のみ、譲渡フローは別途設計)。
 * `Role` enum に新規ロールを追加した際は、ここも更新する必要がある(`as const` で TS 側に型推論させる)。
 */
const NON_OWNER_ROLES = [
  Role.ADMIN,
  Role.DEVELOPER,
  Role.REVIEWER,
  Role.TESTER,
  Role.VIEWER,
] as const;

/** `POST /workspaces/:slug/invitations` のリクエストボディ。 */
export class CreateInvitationDto {
  /** 招待先メールアドレス。 */
  @IsEmail()
  email!: string;

  /**
   * 付与するロール(OWNER 以外)。
   * `@IsIn` で OWNER を構造的に弾く(`@IsEnum(Role)` だと OWNER を許してしまう)。
   */
  @IsIn(NON_OWNER_ROLES)
  role!: (typeof NON_OWNER_ROLES)[number];
}

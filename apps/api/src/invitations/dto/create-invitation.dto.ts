import { IsEmail, IsIn } from 'class-validator';

import { NON_OWNER_ROLES } from '../../auth/roles';

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

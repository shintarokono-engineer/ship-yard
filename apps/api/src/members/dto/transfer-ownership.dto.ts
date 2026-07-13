import { IsNotEmpty, IsString } from 'class-validator';

/** `POST /workspaces/:slug/transfer-ownership` のリクエストボディ。 */
export class TransferOwnershipDto {
  /** 新しい OWNER にする既存メンバーの User ID(cuid)。 */
  @IsString()
  @IsNotEmpty()
  targetUserId!: string;
}

/** 招待トークン用ランダムバイト数(base64url で 43 文字、推測困難で URL safe)。 */
export const INVITATION_TOKEN_BYTES = 32;

/** 招待リンクの有効期限(発行から N 日、`InvitationToken.expiresAt` に反映)。 */
export const INVITATION_VALIDITY_DAYS = 7;

/**
 * 招待の状態(派生プロパティ、DB には保存しない)。
 *
 * 真実の源は `InvitationToken` の 3 列(`acceptedAt` / `revokedAt` / `expiresAt`)で、
 * `computeInvitationStatus` がこの 3 列から導出する。Prisma 生成 enum(`Role` 等)と
 * 同じ `as const` + type union パターンで値も型も同名 export(TypeScript enum は
 * tree-shake 不可 / トランスパイラ非互換のため採用しない)。
 */
export const InvitationStatus = {
  PENDING: 'PENDING',
  ACCEPTED: 'ACCEPTED',
  EXPIRED: 'EXPIRED',
  REVOKED: 'REVOKED',
} as const;
export type InvitationStatus = (typeof InvitationStatus)[keyof typeof InvitationStatus];

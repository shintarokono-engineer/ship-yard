/** Clerk JWT 検証後にリクエストへ載せる認証ユーザー情報 */
export interface AuthUser {
  /** Clerk のユーザー ID(JWT の sub クレーム) */
  clerkUserId: string;
}

// Express の Request に user を生やす(ClerkAuthGuard がセット、@CurrentUser() が読む)
declare module 'express' {
  interface Request {
    user?: AuthUser;
  }
}

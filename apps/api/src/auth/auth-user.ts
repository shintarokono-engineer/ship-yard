import type { WorkspaceAccess } from '../workspaces/membership.service';

/** Clerk JWT 検証後にリクエストへ載せる認証ユーザー情報 */
export interface AuthUser {
  /** Clerk のユーザー ID(JWT の sub クレーム) */
  clerkUserId: string;
}

// Express の Request に認証/認可コンテキストを生やす
declare module 'express' {
  interface Request {
    /** ClerkAuthGuard が検証してセット、@CurrentUser() が読む */
    user?: AuthUser;
    /** WorkspaceGuard が解決してセット(tenantId / name / plan / role / userId)、@CurrentWorkspace() が読む */
    workspaceAccess?: WorkspaceAccess;
  }
}

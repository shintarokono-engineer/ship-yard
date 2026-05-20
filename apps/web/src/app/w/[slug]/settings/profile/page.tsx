import { UserProfile } from '@clerk/nextjs';

/**
 * 設定 → プロフィールタブ。
 *
 * プロフィール・メール・パスワード等の認証情報は Clerk のホスト画面に委譲し、
 * 本アプリでは編集 UI を持たない(MVP スコープ最小化、Day 25 スコープ判断)。
 *
 * `routing="hash"` で `/w/{slug}/settings/profile#/...` に Clerk 内部の遷移を閉じ込め、
 * App Router の dynamic catch-all を切らずに済ませる(`<UserButton>` と同じ運用)。
 */
export default function ProfilePage() {
  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">
        プロフィール・メール・パスワードの編集は下記の管理画面(Clerk)で行います。
      </p>
      <div className="flex justify-center">
        <UserProfile routing="hash" />
      </div>
    </div>
  );
}

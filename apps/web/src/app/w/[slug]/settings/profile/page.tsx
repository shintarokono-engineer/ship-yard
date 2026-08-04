import { UserProfile } from '@clerk/nextjs';

/**
 * 設定 → プロフィールタブ。
 *
 * プロフィール・メール・パスワード等の認証情報は Clerk のホスト画面に委譲し、
 * 本アプリでは編集 UI を持たない(MVP スコープ最小化、Day 25 スコープ判断)。
 *
 * `routing="hash"` で `/w/{slug}/settings/profile#/...` に Clerk 内部の遷移を閉じ込め、
 * App Router の dynamic catch-all を切らずに済ませる(`<UserButton>` と同じ運用)。
 *
 * **既定のセクションのうち「API キー」を隠している**(2026-08-04 の公開前レビュー)。
 * Neorie はユーザー向けの API を提供しておらず、ここで発行したキーの使い道が無い。
 * 使えないものを設定画面に出すと「何かできるはず」と探させることになる。
 * API を公開したらこの指定を外すこと。
 *
 * 「アクティブなデバイス」(security タブ内)は**残している**。セッション管理は
 * ユーザーが自分の身を守るための機能で、提供していない機能ではないため
 * (身に覚えのない端末からのサインインに気付いて失効させられる)。
 */
export default function ProfilePage() {
  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">
        プロフィール・メール・パスワードの編集は下記の管理画面(Clerk)で行います。
      </p>
      <div className="flex justify-center">
        <UserProfile routing="hash">
          <UserProfile.Page label="account" />
          <UserProfile.Page label="security" />
        </UserProfile>
      </div>
    </div>
  );
}

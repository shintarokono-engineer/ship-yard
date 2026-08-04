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
 * **`apiKeysProps={{ hide: true }}` で「API キー」タブを隠している**(2026-08-04 の
 * 公開前レビュー)。Neorie はユーザー向けの API を提供しておらず、ここで発行したキーの
 * 使い道が無い。使えないものを設定画面に出すと「何かできるはず」と探させることになる。
 * API を公開したらこの指定を外すこと。
 *
 * `<UserProfile.Page label="account" />` を並べる方法では**隠せない**(あれはカスタム
 * ページを追加する API で、既定タブの絞り込みではない)。同じ画面には右上の
 * `<UserButton>` からも入れるので、そちらにも `userProfileProps` 経由で同じ指定が要る。
 *
 * 「アクティブなデバイス」(セキュリティタブ内)は**残している**。セッション管理は
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
        <UserProfile routing="hash" apiKeysProps={{ hide: true }} />
      </div>
    </div>
  );
}

'use client';

import { useEffect } from 'react';

/**
 * `/sign-out-cleanup` — Clerk サインアウト後の中間ページ(F1.5、§9.12.2 観点 2)。
 *
 * **目的**: Clerk SDK の `signOut()` 後にクライアント側状態(LocalStorage / SessionStorage)が
 * 完全クリアされず、次の OAuth フロー(Continue with Google 等)で `Uncaught FetchError` の
 * 白紙画面が発生する問題を回避する。
 *
 * **背景**: Clerk Issue #6691(https://github.com/clerk/javascript/issues/6691)で
 * 公式に "Closed as not planned" としてクローズされた問題と同源。
 * Clerk チームは修正しないと宣言したため、開発者側でワークアラウンドを実装する必要がある
 * (Issue 内提案コード `sessionStorage.clear() + signOut({ sessionId: ['all'] })` に準拠)。
 *
 * **処理**:
 *   ① LocalStorage の Clerk 関連キー(`__clerk_*` / `clerk_*` 等)をピンポイント削除
 *      (他機能の状態 = テーマ等は温存)
 *   ② SessionStorage を完全クリア
 *   ③ `window.location.replace('/')` でフルロード遷移 → Clerk SDK が新規セッションで再初期化
 *
 * **限界**: `*.clerk.accounts.dev` ドメインの Cookie は Same-origin policy でアプリから
 * 触れない。フルロード起動 + SDK 側の通常失効処理で大半のケースは解消するが、残るケースは
 * シークレットウィンドウが fallback(`docs/runbooks/clerk-webhook-troubleshooting.md` §2.6)。
 *
 * **公開ルート**: middleware で `/sign-out-cleanup` を Clerk 認証から除外する必要あり
 * (サインアウト直後にアクセスするため、認証必須にすると loop する)。
 */
export default function SignOutCleanupPage() {
  useEffect(() => {
    // ① LocalStorage の Clerk 関連キーをピンポイント削除(他機能を巻き込まない)。
    //    Clerk が使うキーは `__clerk_*`(主)or `clerk_*` で固定なので prefix で十分。
    //    `includes('clerk')` だと第三者ライブラリや将来の Shipyard 命名(例:`workspace_clerk_config`)
    //    を巻き込みうるため、prefix に絞る。
    try {
      Object.keys(localStorage)
        .filter((k) => k.startsWith('__clerk') || k.startsWith('clerk_'))
        .forEach((k) => localStorage.removeItem(k));
    } catch {
      // プライベートモード等のアクセス制限は無視(次のステップに進む)
    }

    // ② SessionStorage は Clerk 専用ではないが、サインアウト時は全クリアで安全側に倒す。
    //    ① の例外で道連れにしないよう独立 try/catch にする(SessionStorage クリアは
    //    Issue #6691 ワークアラウンドの主要ステップ)。
    try {
      sessionStorage.clear();
    } catch {
      // 同上
    }

    // ③ フルロードでホームへ遷移 → SDK が新規セッションで再初期化される。
    //    `replace` で history に残さない(戻るボタンで cleanup ページに戻る挙動を防ぐ)。
    window.location.replace('/');
  }, []);

  return (
    <div className="bg-background flex min-h-screen flex-col items-center justify-center gap-3 p-4">
      <div
        className="border-primary size-8 animate-spin rounded-full border-2 border-t-transparent"
        aria-hidden="true"
      />
      <p className="text-muted-foreground text-sm" role="status">
        サインアウトを完了しています…
      </p>
    </div>
  );
}

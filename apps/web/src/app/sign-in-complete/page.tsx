'use client';

import { useEffect } from 'react';

/**
 * `/sign-in-complete` — Clerk サインイン後の中間ページ(`/sign-out-cleanup` の対になるもの)。
 *
 * **目的**: email / password サインイン後に Clerk `<SignIn>` がクライアント遷移(router.push)で
 * fallback redirect 先(`/`)へ移動すると、`/` はサーバ側で所属ワークスペースへ `redirect()` する
 * 設計のため、RSC の redirect がクライアント遷移に follow されず **`/` に留まって白紙**になる
 * (`/` は認証済みユーザー向けに何も描画しないため)。OAuth はプロバイダ callback による
 * フルページリダイレクトなので `/` がサーバで新規評価され redirect が成立し、この問題は起きない。
 *
 * **対処**: サインインの fallback redirect をこの中間ページに向け、ここから
 * `window.location.replace('/')` の **フルロード遷移**で `/` を開き直す。これにより email
 * サインインでも OAuth と同じフルロード経路になり、`/` のサーバ redirect が確実に成立する
 * (`/sign-out-cleanup` と同思想。Clerk Issue #6691 系のワークアラウンド)。
 *
 * **公開ルート**: サインイン直後の遷移中にアクセスするため、middleware で認証必須から除外する。
 */
export default function SignInCompletePage() {
  useEffect(() => {
    // フルロードで `/` を開き直す → サーバで所属 WS 判定 → `/w/{slug}` or `/onboarding` へ確実に遷移。
    // `replace` で history に残さない(戻るボタンでこの中間ページに戻る挙動を防ぐ)。
    window.location.replace('/');
  }, []);

  return (
    <div className="bg-background flex min-h-screen flex-col items-center justify-center gap-3 p-4">
      <div
        className="border-primary size-8 animate-spin rounded-full border-2 border-t-transparent"
        aria-hidden="true"
      />
      <p className="text-muted-foreground text-sm" role="status">
        サインインを完了しています…
      </p>
    </div>
  );
}

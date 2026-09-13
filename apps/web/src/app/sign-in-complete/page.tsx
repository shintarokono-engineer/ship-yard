'use client';

import { Suspense, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

import { Spinner } from '@/components/ui/spinner';

/**
 * `?next=` で受け取ってよい遷移先か検証する。
 *
 * **オープンリダイレクトを作らないために必須。**`//evil.example` や `https://evil.example` は
 * ブラウザからは外部 URL として解釈されるため、`/` 始まりであることに加えて 2 文字目が
 * `/` でも `\\` でもないことまで見る。
 */
function safeNextPath(next: string | null): string {
  if (!next || !next.startsWith('/')) return '/';
  if (next.startsWith('//') || next.startsWith('/\\')) return '/';
  return next;
}

function SigningInIndicator() {
  return (
    <div className="bg-background flex min-h-screen flex-col items-center justify-center gap-3 p-4">
      <Spinner className="text-primary size-8" />
      <p className="text-muted-foreground text-sm">サインインを完了しています…</p>
    </div>
  );
}

/** `useSearchParams` は静的プリレンダー時に Suspense 境界を要求するため、ページ本体から分離する。 */
function SignInCompleteRedirect() {
  const searchParams = useSearchParams();
  const next = safeNextPath(searchParams.get('next'));

  useEffect(() => {
    // フルロードで開き直す → サーバで判定 → 目的のページへ確実に遷移。
    // `replace` で history に残さない(戻るボタンでこの中間ページに戻る挙動を防ぐ)。
    window.location.replace(next);
  }, [next]);

  return <SigningInIndicator />;
}

/**
 * Clerk のサインイン完了後に経由する中間ページ。
 *
 * Clerk の `afterSignInUrl` はクライアント遷移(`router.push`)で処理され、RSC の redirect が
 * follow されず白紙のまま止まることがある。ここで一度フルロードを挟むことで、
 * サインインでも OAuth と同じフルロード経路になり、`/` のサーバ redirect が確実に成立する
 * (`/sign-out-cleanup` と同思想。Clerk Issue #6691 系のワークアラウンド)。
 *
 * **公開ルート**: サインイン直後の遷移中にアクセスするため、middleware で認証必須から除外する。
 *
 * **`?next=` で遷移先を指定できる**(ADR-015)。`/check` の結果からサインアップした人を
 * 引き換えページへ送るために使う。
 */
export default function SignInCompletePage() {
  return (
    <Suspense fallback={<SigningInIndicator />}>
      <SignInCompleteRedirect />
    </Suspense>
  );
}

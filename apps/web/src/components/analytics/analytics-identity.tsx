'use client';

import { useEffect } from 'react';
import { useUser } from '@clerk/nextjs';

import { hashUserId, setAnalyticsUserId, trackSignUp } from '@/lib/analytics';

/**
 * GA4 の user_id 設定と `sign_up` イベント送信。描画は行わない。
 * `useUser()` を使うため `<ClerkProvider>`(`app/providers.tsx`)の内側に置くこと。
 *
 * 送るのは Clerk のユーザー ID をハッシュした擬似 ID のみで、PII は一切送らない。
 *
 * **sign_up の検知**: Clerk はサインイン / サインアップとも `/sign-in-complete` を経由するため
 * 遷移先から新規登録を区別できず、ユーザー作成も Webhook → API 側で行われるためフロントには
 * 「今サインアップした」状態が返ってこない。そこで `user.createdAt` が直近かで判定する。
 */

/**
 * 「作成直後 = サインアップ完了」とみなす猶予。OAuth の往復や回線の遅さを吸収しつつ、
 * 長すぎると「登録翌日の再訪」を誤検知するため 10 分に留める。
 */
const SIGN_UP_DETECTION_WINDOW_MS = 10 * 60 * 1000;

export function AnalyticsIdentity() {
  const { isLoaded, user } = useUser();

  useEffect(() => {
    if (!isLoaded || !user) return;

    let cancelled = false;

    void (async () => {
      const hashed = await hashUserId(user.id);
      // Web Crypto が使えない環境では擬似 ID を作れない。user_id 無しで計測を続ける。
      if (cancelled || !hashed) return;

      setAnalyticsUserId(hashed);

      // 経過ミリ秒の比較のみ(パース・タイムゾーン処理は無し)なので dayjs は使わない。
      const createdAt = user.createdAt;
      if (!createdAt) return;
      if (Date.now() - createdAt.getTime() > SIGN_UP_DETECTION_WINDOW_MS) return;

      trackSignUp(resolveSignUpMethod(user));
    })();

    return () => {
      cancelled = true;
    };
  }, [isLoaded, user]);

  return null;
}

/**
 * 認証手段を `google` / `github` / `email` 等に正規化する。Clerk の `provider` は SDK の
 * バージョンによって `google` / `oauth_google` の表記揺れがあるため接頭辞を落とす。
 * **プロバイダ名以外(アカウント名・メールアドレス)は含めないこと。**
 */
function resolveSignUpMethod(user: NonNullable<ReturnType<typeof useUser>['user']>): string {
  const provider = user.externalAccounts?.[0]?.provider;
  if (provider) return provider.replace(/^oauth_/, '');
  return user.passwordEnabled ? 'email' : 'unknown';
}

'use server';

import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

import { ApiError, extractValidationMessages } from '@/lib/api/errors';
import { initiateTwitterAuthorize } from '@/lib/api/integrations';

import type { InitiateTwitterOAuthFormState } from '../_shared/initiate-twitter-oauth-form';

/**
 * Twitter (X) OAuth 開始 Server Action(ADR-014)。
 *
 * BE `/authorize` を Bearer JWT 付きで叩き、返ってきた X 認可 URL に `redirect()` する。
 * ブラウザから `<a href>` で BE を直接叩くと Authorization ヘッダーが送られず 401 になるため、
 * Server Action 経由で Bearer JWT を付ける BFF プロキシパターン。
 *
 * Next.js 15 の `'use server'` は **async 関数のみ export 可能** なので、
 * 型 / 定数 は `../_shared/initiate-twitter-oauth-form` に分離してある(既存 README パターン踏襲)。
 *
 * エラー分岐:
 * - 401 / 403 → OWNER / ADMIN 以外による起動 or 認証切れ
 * - 503 → env(TWITTER_CLIENT_ID / SECRET / UPSTASH_*)未設定
 * - その他 → 汎用エラー文言
 */
export async function initiateTwitterOAuthAction(
  slug: string,
  _prev: InitiateTwitterOAuthFormState,
  _formData: FormData,
): Promise<InitiateTwitterOAuthFormState> {
  void _prev;
  void _formData;
  const { userId } = await auth();
  if (!userId) {
    return { ok: false, formError: '認証が必要です。再度サインインしてください。' };
  }

  let url: string;
  try {
    const res = await initiateTwitterAuthorize(slug);
    url = res.url;
  } catch (e) {
    if (e instanceof ApiError) {
      const msgs = extractValidationMessages(e.body);
      if (e.status === 403) {
        return {
          ok: false,
          formError: 'X アカウントを連携する権限がありません(OWNER / ADMIN のみ)。',
        };
      }
      if (e.status === 503) {
        return {
          ok: false,
          formError:
            msgs[0] || 'X 連携機能が未設定です。管理者は設定(環境変数)を確認してください。',
        };
      }
      return {
        ok: false,
        formError: `X 連携の開始に失敗しました (HTTP ${e.status})`,
      };
    }
    throw e;
  }

  // BE が返した X 認可 URL に遷移(next/navigation の redirect は throw で制御を戻す)。
  redirect(url);
}

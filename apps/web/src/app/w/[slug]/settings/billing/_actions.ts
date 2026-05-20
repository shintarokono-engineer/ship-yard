'use server';

import { redirect } from 'next/navigation';

import { createPortalSession } from '@/lib/api/billing';
import { ApiError } from '@/lib/api/errors';

import type { PortalSessionFormState } from './_shared/portal-session-form';

export type { PortalSessionFormState } from './_shared/portal-session-form';

/**
 * Stripe Customer Portal Session を作成して URL に redirect する Server Action。
 *
 * `slug` は URL 由来の固定値なので呼び出し側で `bind` して固定する(`invite` の accept Action と同じ流儀)。
 * Next.js の `redirect()` は内部例外で抜けるため、try/catch の外側で呼ぶ。Stripe API 障害 / Portal 未設定で
 * `ApiError` になった場合は state にメッセージを載せて返し、ボタン下に表示する。
 */
export async function openPortalSessionAction(
  slug: string,
  _prev: PortalSessionFormState,
  _formData: FormData,
): Promise<PortalSessionFormState> {
  void _prev;
  void _formData;

  let url: string;
  try {
    const res = await createPortalSession(slug);
    url = res.url;
  } catch (e) {
    if (e instanceof ApiError) {
      if (e.status === 403) {
        return { ok: false, error: 'Stripe Portal を開く権限がありません(OWNER のみ操作可能です)。' };
      }
      if (e.status === 404) {
        return { ok: false, error: 'ワークスペースが見つかりませんでした。' };
      }
      return {
        ok: false,
        error: `Stripe Portal の起動に失敗しました (HTTP ${e.status})。Stripe ダッシュボードで Customer Portal が有効化されているかご確認ください。`,
      };
    }
    throw e;
  }

  redirect(url);
}

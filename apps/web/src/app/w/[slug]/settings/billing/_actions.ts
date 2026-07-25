'use server';

import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

import { createCheckoutSession, createPortalSession } from '@/lib/api/billing';
import { ApiError } from '@/lib/api/errors';
import { isPaidPlan, type Plan } from '@/lib/api/types';

import type { CheckoutSessionFormState } from './_shared/checkout-session-form';
import type { PortalSessionFormState } from './_shared/portal-session-form';

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

  const { userId } = await auth();
  if (!userId) {
    return { ok: false, error: '認証が必要です。再度サインインしてください。' };
  }

  let url: string;
  try {
    const res = await createPortalSession(slug);
    url = res.url;
  } catch (e) {
    if (e instanceof ApiError) {
      if (e.status === 403) {
        return {
          ok: false,
          error: 'Stripe Portal を開く権限がありません(OWNER のみ操作可能です)。',
        };
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

/**
 * 指定プランの Stripe Checkout Session を作成して URL に redirect する Server Action。
 *
 * **用途はトライアル終了 / 解約後(`Tenant.plan = FREE`)からの新規契約に限る**。Customer Portal は
 * 既存 Subscription の更新機能なので、Subscription を持たないテナントを課金導線に乗せられない
 * (ADR-012 のトライアルは `trial_settings.missing_payment_method: 'cancel'` で 7 日後に Stripe 側で
 * 削除される)。有効な Subscription があるテナントのプラン変更は Portal 側で行う。
 *
 * `slug` / `plan` は呼び出し側で `bind` して固定するが、bind 引数はクライアント経由で渡るため
 * サーバ側で有料プランかを再検証する(FREE には Price が無く BE も 400 を返す)。
 */
export async function startCheckoutSessionAction(
  slug: string,
  plan: Plan,
  _prev: CheckoutSessionFormState,
  _formData: FormData,
): Promise<CheckoutSessionFormState> {
  void _prev;
  void _formData;

  const { userId } = await auth();
  if (!userId) {
    return { ok: false, error: '認証が必要です。再度サインインしてください。' };
  }
  if (!isPaidPlan(plan)) {
    return { ok: false, error: '選択できないプランです。' };
  }

  let url: string;
  try {
    const res = await createCheckoutSession(slug, plan);
    url = res.url;
  } catch (e) {
    if (e instanceof ApiError) {
      if (e.status === 403) {
        return {
          ok: false,
          error: 'プランを購入する権限がありません(OWNER のみ操作可能です)。',
        };
      }
      if (e.status === 404) {
        return { ok: false, error: 'ワークスペースが見つかりませんでした。' };
      }
      return {
        ok: false,
        error: `決済ページの起動に失敗しました (HTTP ${e.status})。時間をおいて再度お試しください。`,
      };
    }
    throw e;
  }

  redirect(url);
}

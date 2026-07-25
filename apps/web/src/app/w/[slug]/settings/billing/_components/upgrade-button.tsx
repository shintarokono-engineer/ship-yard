'use client';

import { useActionState, useMemo } from 'react';
import { CreditCard } from 'lucide-react';

import { Button } from '@/components/ui/button';
import type { PaidPlan } from '@/lib/api/types';

import { startCheckoutSessionAction } from '../_actions';
import {
  INITIAL_CHECKOUT_SESSION_STATE,
  type CheckoutSessionFormState,
} from '../_shared/checkout-session-form';

/**
 * プラン比較カードの購入 CTA。Server Action で Stripe Checkout Session を作り、返却 URL に redirect する。
 *
 * 表示されるのは「Subscription を持たないテナント(トライアル終了 / 解約後 = `plan` が FREE)」の
 * 有料プランカードのみ(`PlanComparison` 側で制御)。有効な Subscription があるテナントの
 * プラン変更は Customer Portal に委譲する(Checkout を使うと二重契約になるため)。
 *
 * 成功時は `redirect()` でページが遷移するため、ここに戻ってくるのはエラー時のみ。
 */
export function UpgradeButton({
  slug,
  plan,
  label,
}: {
  slug: string;
  plan: PaidPlan;
  label: string;
}) {
  const boundAction = useMemo(
    () => startCheckoutSessionAction.bind(null, slug, plan),
    [slug, plan],
  );
  const [state, formAction, pending] = useActionState<CheckoutSessionFormState, FormData>(
    boundAction,
    INITIAL_CHECKOUT_SESSION_STATE,
  );

  return (
    <div className="space-y-2">
      <form action={formAction}>
        <Button type="submit" className="w-full" disabled={pending} aria-busy={pending}>
          <CreditCard aria-hidden="true" />
          {pending ? '決済ページへ移動中...' : `${label} にアップグレード`}
        </Button>
      </form>
      {!state.ok && state.error && (
        <p
          role="alert"
          className="border-destructive/40 bg-destructive/10 text-destructive rounded-md border px-3 py-2 text-sm"
        >
          {state.error}
        </p>
      )}
    </div>
  );
}

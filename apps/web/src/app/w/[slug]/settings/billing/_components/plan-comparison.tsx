import { Check } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { Plan } from '@/lib/api/types';
import { PLANS, PLAN_META, isPaidPlan } from '@/lib/api/types';

import { UpgradeButton } from './upgrade-button';

/**
 * Free / Pro / Team の機能・価格比較カード(ADR-004 から転記)。
 *
 * 現プランは枠を強調し「現在のプラン」バッジを付ける。
 *
 * CTA の出し分け(ADR-012):
 * - `currentPlan === 'FREE'`(トライアル終了 / 解約後 = Stripe に Subscription が無い)
 *   → 有料プランカードに Checkout ボタンを出す。Customer Portal は既存 Subscription の更新機能で
 *     新規契約を開始できないため、この状態では Portal だけだと課金導線が行き止まりになる
 * - 有効な Subscription がある(トライアル中 / 有料中)→ ボタンを出さず、プラン変更・解約は
 *   上の Portal ボタンに委譲する(Checkout を使うと Stripe 側で二重契約になる)
 */
export function PlanComparison({ slug, currentPlan }: { slug: string; currentPlan: Plan }) {
  // Subscription を持たない状態でのみ Checkout を許可する(二重契約の防止)。
  const canCheckout = currentPlan === 'FREE';

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {PLANS.map((plan) => {
        const meta = PLAN_META[plan];
        const isCurrent = plan === currentPlan;
        return (
          <Card
            key={plan}
            className={cn(
              'transition-colors',
              isCurrent ? 'border-primary ring-primary/20 ring-2' : 'border-border',
            )}
          >
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-lg">{meta.label}</CardTitle>
                {isCurrent && (
                  <Badge variant="default" className="text-xs">
                    現在のプラン
                  </Badge>
                )}
              </div>
              <CardDescription>{meta.tagline}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-xl font-semibold">{meta.priceLabel}</p>
              <ul className="space-y-1.5">
                {meta.limits.map((limit, i) => (
                  <li
                    key={`${plan}-${i}`}
                    className="text-muted-foreground flex items-start gap-2 text-sm"
                  >
                    <Check className="text-primary mt-0.5 size-4 shrink-0" aria-hidden="true" />
                    <span>{limit}</span>
                  </li>
                ))}
              </ul>
              {canCheckout && isPaidPlan(plan) && (
                <UpgradeButton slug={slug} plan={plan} label={meta.label} />
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

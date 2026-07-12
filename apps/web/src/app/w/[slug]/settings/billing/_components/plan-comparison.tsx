import { Check } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { Plan } from '@/lib/api/types';
import { PLANS, PLAN_META } from '@/lib/api/types';

/**
 * Free / Pro / Team の機能・価格比較カード(ADR-004 から転記)。
 *
 * 現プランは枠を強調し「現在のプラン」バッジを付ける。プラン変更操作は Stripe Customer Portal に
 * すべて委譲しているため、このカード自体はクリック不可の比較表示のみ(CTA は上の Portal ボタン)。
 */
export function PlanComparison({ currentPlan }: { currentPlan: Plan }) {
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
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

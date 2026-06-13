import { Coins } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { FEATURE_CREDIT_COSTS, type MonthlyUsageSummary } from '@/lib/api/types';
import { cn } from '@/lib/utils';

/**
 * AI 機能の実行直前に「X クレジット消費(残り Y クレジット / 月)」 を表示する Badge(F7、§9.12.2 観点 7)。
 *
 * - 単価は `FEATURE_CREDIT_COSTS`(BE の `MODEL_CREDITS` × ターン数を反映)
 * - 残量は `usage.limitCredits - usage.usedCredits`(`GET /workspaces/:slug/usage`)
 * - プラン別文言分岐:
 *   - FREE: AI 停止状態を明示(`tone="warning"`)
 *   - PRO / TEAM:残量を表示。残量が単価より少ない場合は `tone="warning"`
 *
 * Server Component / Client Component の両方から使える純コンポーネント(`'use client'` 無し)。
 */
export function CreditCostBadge({
  feature,
  usage,
  className,
}: {
  feature: keyof typeof FEATURE_CREDIT_COSTS;
  usage: MonthlyUsageSummary;
  className?: string;
}) {
  const cost = FEATURE_CREDIT_COSTS[feature];

  if (usage.plan === 'FREE') {
    return (
      <Tone tone="warning" className={className}>
        {cost} クレジット消費(AI 停止中)
      </Tone>
    );
  }

  const remaining = Math.max(0, usage.limitCredits - usage.usedCredits);
  const insufficient = remaining < cost;

  return (
    <Tone tone={insufficient ? 'warning' : 'neutral'} className={className}>
      {cost} クレジット消費(残り {remaining} クレジット / 月)
    </Tone>
  );
}

function Tone({
  tone,
  className,
  children,
}: {
  tone: 'neutral' | 'warning';
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Badge
      variant="outline"
      className={cn(
        'font-normal tabular-nums',
        tone === 'warning' && 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
        className,
      )}
    >
      <Coins className="mr-1 size-3" aria-hidden="true" />
      {children}
    </Badge>
  );
}

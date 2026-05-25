import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { BillingDetail } from '@/lib/api/types';
import { PLAN_META, SUB_STATUS_META } from '@/lib/api/types';

/**
 * 現在のプランと Subscription 状態の詳細を表示する Card。
 *
 * 「解約予約中」判定: schema に `cancel_at_period_end` を保存していないため、`canceledAt != null` かつ
 * `status === 'ACTIVE'` の組み合わせで暫定的に判定する(BillingService と整合)。即時解約後は
 * `status === 'CANCELED'` になるので別表示に分岐できる。
 */
export function SubscriptionStatus({ billing }: { billing: BillingDetail }) {
  const planMeta = PLAN_META[billing.plan];
  const statusMeta = SUB_STATUS_META[billing.status];
  const cancelScheduled = billing.status === 'ACTIVE' && billing.canceledAt !== null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">現在のプラン</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-baseline gap-3">
          <span className="text-2xl font-semibold">{planMeta.label}</span>
          <span className="text-muted-foreground text-sm">{planMeta.priceLabel}</span>
          <Badge variant={statusMeta.badgeVariant} className={statusMeta.badgeClassName}>
            {statusMeta.label}
          </Badge>
        </div>

        {billing.status === 'PAST_DUE' && (
          <p
            role="alert"
            className="border-destructive/40 bg-destructive/10 text-destructive rounded-md border px-3 py-2 text-sm"
          >
            支払いに失敗しています。Portal
            で支払い方法を更新してください(更新されない場合、利用が停止されます)。
          </p>
        )}

        {cancelScheduled && billing.currentPeriodEnd && (
          <p className="text-muted-foreground text-sm">
            解約予約済み: {formatDate(billing.currentPeriodEnd)}{' '}
            まで現在のプランをご利用いただけます。
          </p>
        )}

        {billing.status === 'ACTIVE' && !cancelScheduled && billing.currentPeriodEnd && (
          <p className="text-muted-foreground text-sm">
            次回更新: {formatDate(billing.currentPeriodEnd)}
          </p>
        )}

        {billing.status === 'TRIALING' && billing.currentPeriodEnd && (
          <p className="text-muted-foreground text-sm">
            トライアル終了: {formatDate(billing.currentPeriodEnd)}
          </p>
        )}

        {billing.status === 'CANCELED' && billing.canceledAt && (
          <p className="text-muted-foreground text-sm">解約日: {formatDate(billing.canceledAt)}</p>
        )}
      </CardContent>
    </Card>
  );
}

const dateFormatter = new Intl.DateTimeFormat('ja-JP', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  timeZone: 'Asia/Tokyo',
});

function formatDate(iso: string): string {
  return dateFormatter.format(new Date(iso));
}

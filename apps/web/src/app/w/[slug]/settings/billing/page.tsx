import { notFound } from 'next/navigation';
import { ShieldAlert } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { fetchBilling } from '@/lib/api/billing';
import { fetchWorkspace } from '@/lib/api/workspaces';

import { PlanComparison } from './_components/plan-comparison';
import { PortalButton } from './_components/portal-button';
import { SubscriptionStatus } from './_components/subscription-status';

/**
 * `/w/{slug}/settings/billing` — 請求 / プラン管理ページ。
 *
 * - 所属・slug チェックは親 `apps/web/src/app/w/[slug]/layout.tsx` で済む(未所属 / 不在は 404)
 * - OWNER 以外は「OWNER のみアクセス可能」を表示(BE が 403 を返すので UI と二重で防御)
 * - プラン変更 / 支払い方法 / 解約は Stripe Customer Portal に完全委譲(ADR-004)
 */
export default async function BillingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  // 親 layout で所属確認済みだが、role を引くため再度取得(`React.cache` で dedup される)。
  const workspace = await fetchWorkspace(slug);
  if (!workspace) {
    notFound();
  }

  const isOwner = workspace.role === 'OWNER';

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">請求とプラン</h1>
        <p className="text-muted-foreground text-sm">
          現在のプラン、次回更新日、支払い情報を確認し、プラン変更や解約を行います。
        </p>
      </header>

      {isOwner ? <OwnerView slug={slug} /> : <NonOwnerView />}
    </div>
  );
}

async function OwnerView({ slug }: { slug: string }) {
  const billing = await fetchBilling(slug);
  // OWNER 確認は親で済んでいるので通常 null は来ないが、Stripe / DB 障害時に備えて防御的に。
  if (!billing) {
    return (
      <Card>
        <CardContent className="text-muted-foreground py-8 text-sm">
          請求情報を取得できませんでした。時間をおいて再度お試しください。
        </CardContent>
      </Card>
    );
  }

  // Subscription 側の plan を正とする(Webhook で `Tenant.plan` と同期される値の出所)。
  // FREE = トライアル終了 / 解約後で Stripe に有効な Subscription が無い状態。
  const hasSubscription = billing.plan !== 'FREE';

  return (
    <div className="space-y-6">
      <SubscriptionStatus billing={billing} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">支払い情報・プラン変更</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-muted-foreground text-sm">
            {hasSubscription
              ? '支払い方法の更新、請求書履歴の確認、プラン変更、解約はすべて Stripe のポータルから行います。'
              : '支払い方法の更新と請求書履歴の確認は Stripe のポータルから行います。プランの再開は下のプラン比較から選択してください。'}
          </p>
          <PortalButton slug={slug} />
        </CardContent>
      </Card>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">プラン比較</h2>
        <PlanComparison slug={slug} currentPlan={billing.plan} />
      </section>
    </div>
  );
}

function NonOwnerView() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldAlert className="text-muted-foreground size-4" aria-hidden="true" />
          OWNER のみアクセス可能
        </CardTitle>
      </CardHeader>
      <CardContent className="text-muted-foreground space-y-2 text-sm">
        <p>請求とプランの管理はワークスペースのオーナーのみ操作できます。</p>
        <p>プラン変更や支払い情報の更新が必要な場合は、オーナーにご依頼ください。</p>
      </CardContent>
    </Card>
  );
}

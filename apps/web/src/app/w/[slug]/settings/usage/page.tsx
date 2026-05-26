import Link from 'next/link';
import { Sparkles } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FEATURE_META, type MonthlyUsageSummary, type Plan } from '@/lib/api/types';
import { fetchUsage } from '@/lib/api/workspaces';
import { formatYearMonth } from '@/lib/format';
import { cn } from '@/lib/utils';

/** 上限のこの割合を超えたら進捗バー・文言を警告色に切り替える。 */
const NEAR_LIMIT_RATIO = 0.8;

/**
 * 設定 → 利用状況タブ。
 *
 * テナントの当月 AI クレジット消費(`GET /workspaces/:slug/usage`、ADR-012)を表示する。
 * Pro / Team は月次上限(クレジット)で管理され、Free はトライアル終了後 = AI 停止状態。
 */
export default async function UsagePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const usage = await fetchUsage(slug);
  const periodLabel = formatYearMonth(usage.periodStart);
  // OTHER(embedding / RAG 検索などの裏方処理)は cr=0 で記録される。表示も非対象。
  const featureBreakdown = usage.byFeature.filter((f) => f.feature !== 'OTHER');

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <UsageSummaryCard usage={usage} periodLabel={periodLabel} slug={slug} />
      <FeatureBreakdownCard byFeature={featureBreakdown} />
    </div>
  );
}

/** プランの表示ラベル(Plan enum)。 */
const PLAN_LABELS: Record<Plan, string> = {
  FREE: 'Free',
  PRO: 'Pro',
  TEAM: 'Team',
};

/** 当月のクレジット消費サマリ(ADR-012)。FREE は AI 停止状態、Pro/Team はクレジット進捗。 */
function UsageSummaryCard({
  usage,
  periodLabel,
  slug,
}: {
  usage: MonthlyUsageSummary;
  periodLabel: string;
  slug: string;
}) {
  const { plan, usedCredits, limitCredits } = usage;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="text-muted-foreground size-4" aria-hidden="true" />
          {periodLabel}の AI 利用状況
        </CardTitle>
        <CardDescription>今月このワークスペースで消費した AI クレジットです。</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">現在のプラン</span>
          <Badge variant="outline" className="font-mono">
            {PLAN_LABELS[plan]}
          </Badge>
        </div>

        {plan === 'FREE' ? (
          <FreeFallbackUsage slug={slug} />
        ) : (
          <CreditsUsage used={usedCredits} limit={limitCredits} />
        )}
      </CardContent>
    </Card>
  );
}

/** FREE(トライアル終了後)向け。AI 機能停止のメッセージ + プラン選択画面への導線。 */
function FreeFallbackUsage({ slug }: { slug: string }) {
  return (
    <div className="border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300 space-y-2 rounded-md border px-3 py-2 text-sm">
      <p className="font-medium">AI 機能は停止中です</p>
      <p className="text-xs">Pro / Team プランへアップグレードすると AI 機能が再開します。</p>
      <Link href={`/w/${slug}/settings/billing`}>
        <Button size="sm" variant="outline">
          プランを選ぶ
        </Button>
      </Link>
    </div>
  );
}

/** Pro / Team 向け。`used / limit` クレジットを進捗バーで表示。 */
function CreditsUsage({ used, limit }: { used: number; limit: number }) {
  const percent = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const reached = limit > 0 && used >= limit;
  const nearLimit = !reached && limit > 0 && used / limit >= NEAR_LIMIT_RATIO;
  const remaining = Math.max(0, limit - used);

  const barColor = reached ? 'bg-destructive' : nearLimit ? 'bg-amber-500' : 'bg-foreground';

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <div>
          <span className="text-2xl font-semibold tabular-nums">{used}</span>
          <span className="text-muted-foreground text-sm tabular-nums"> / {limit} クレジット</span>
        </div>
        <span
          className={cn(
            'text-sm',
            reached
              ? 'text-destructive font-medium'
              : nearLimit
                ? 'text-amber-600 dark:text-amber-400'
                : 'text-muted-foreground',
          )}
        >
          {reached ? '今月のクレジット上限に到達しました' : `残り ${remaining} クレジット`}
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={used}
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-label="今月の AI クレジット消費量"
        className="bg-muted h-2.5 w-full overflow-hidden rounded-full"
      >
        <div
          className={cn('h-full rounded-full transition-all', barColor)}
          style={{ width: `${percent}%` }}
        />
      </div>
      {reached && (
        <p className="text-muted-foreground text-xs">
          引き続き AI 機能を使うには来月の更新までお待ちください。
        </p>
      )}
    </div>
  );
}

/** feature 別の内訳(`OTHER` 除外済み)。クレジット消費量降順で表示する。 */
function FeatureBreakdownCard({ byFeature }: { byFeature: MonthlyUsageSummary['byFeature'] }) {
  // バー幅は最大 credits を 100% とした相対比(視覚的な大小比較のみが目的)。
  const maxCredits = Math.max(...byFeature.map((f) => f.credits), 1);

  return (
    <Card>
      <CardHeader>
        <CardTitle>機能別の内訳</CardTitle>
        <CardDescription>AI 機能ごとのクレジット消費量です。</CardDescription>
      </CardHeader>
      <CardContent>
        {byFeature.length === 0 ? (
          <p className="text-muted-foreground py-4 text-center text-sm">
            今月の AI 利用はまだありません。
          </p>
        ) : (
          <ul className="space-y-3">
            {byFeature.map(({ feature, credits }) => (
              <li key={feature} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span>{FEATURE_META[feature].label}</span>
                  <span className="text-muted-foreground tabular-nums">{credits} クレジット</span>
                </div>
                <div
                  aria-hidden="true"
                  className="bg-muted h-1.5 w-full overflow-hidden rounded-full"
                >
                  <div
                    className="bg-foreground/60 h-full rounded-full"
                    style={{ width: `${Math.round((credits / maxCredits) * 100)}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

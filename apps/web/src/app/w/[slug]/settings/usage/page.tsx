import { Sparkles } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
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
 * テナントの当月 AI 利用回数(`GET /workspaces/:slug/usage`、Day 29 API)を表示する。
 * 全テナントメンバーが閲覧可。所属判定は親 `/w/{slug}/layout.tsx` が済ませているので、
 * ここでは集計取得と描画のみを担う。
 */
export default async function UsagePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const usage = await fetchUsage(slug);
  const periodLabel = formatYearMonth(usage.periodStart);
  // OTHER(embedding / RAG 検索などの裏方処理)はユーザー視点の機能ではないため内訳から除外する。
  // 残った内訳の合計は利用回数(`used`)と一致する。
  const featureBreakdown = usage.byFeature.filter((f) => f.feature !== 'OTHER');

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <UsageSummaryCard usage={usage} periodLabel={periodLabel} />
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

/** 当月の AI 利用回数サマリ。FREE は上限つき進捗バー、PRO/TEAM は「無制限」表示。 */
function UsageSummaryCard({
  usage,
  periodLabel,
}: {
  usage: MonthlyUsageSummary;
  periodLabel: string;
}) {
  const { plan, used, limit } = usage;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="size-4 text-muted-foreground" aria-hidden="true" />
          {periodLabel}の AI 利用状況
        </CardTitle>
        <CardDescription>
          今月このワークスペースで実行した AI 機能の呼び出し回数です。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">現在のプラン</span>
          <Badge variant="outline" className="font-mono">
            {PLAN_LABELS[plan]}
          </Badge>
        </div>

        {limit === null ? (
          <UnlimitedUsage used={used} />
        ) : (
          <LimitedUsage used={used} limit={limit} />
        )}
      </CardContent>
    </Card>
  );
}

/** PRO / TEAM 向け。上限がないので回数と「無制限」バッジのみ。 */
function UnlimitedUsage({ used }: { used: number }) {
  return (
    <div className="flex items-baseline justify-between">
      <div>
        <span className="text-2xl font-semibold tabular-nums">{used}</span>
        <span className="text-muted-foreground ml-1 text-sm">回</span>
      </div>
      <Badge
        variant="outline"
        className="border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
      >
        無制限
      </Badge>
    </div>
  );
}

/** FREE 向け。`used / limit` を進捗バーで表示し、上限到達を一目で分かるようにする。 */
function LimitedUsage({ used, limit }: { used: number; limit: number }) {
  const percent = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const reached = used >= limit;
  const nearLimit = !reached && used / limit >= NEAR_LIMIT_RATIO;
  const remaining = Math.max(0, limit - used);

  const barColor = reached ? 'bg-destructive' : nearLimit ? 'bg-amber-500' : 'bg-foreground';

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <div>
          <span className="text-2xl font-semibold tabular-nums">{used}</span>
          <span className="text-muted-foreground text-sm tabular-nums"> / {limit} 回</span>
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
          {reached ? '今月の上限に到達しました' : `残り ${remaining} 回`}
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={used}
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-label="今月の AI 利用回数"
        className="bg-muted h-2.5 w-full overflow-hidden rounded-full"
      >
        <div
          className={cn('h-full rounded-full transition-all', barColor)}
          style={{ width: `${percent}%` }}
        />
      </div>
      {reached && (
        <p className="text-muted-foreground text-xs">
          引き続き AI 機能を使うには Pro へのアップグレードが必要です。
        </p>
      )}
    </div>
  );
}

/** feature 別の内訳(`OTHER` 除外済み)。count 降順のまま表示する。 */
function FeatureBreakdownCard({ byFeature }: { byFeature: MonthlyUsageSummary['byFeature'] }) {
  // バー幅は最大 count を 100% とした相対比(視覚的な大小比較のみが目的)。
  const maxCount = Math.max(...byFeature.map((f) => f.count), 1);

  return (
    <Card>
      <CardHeader>
        <CardTitle>機能別の内訳</CardTitle>
        <CardDescription>
          AI 機能ごとの呼び出し回数です。合計は上の利用回数と一致します。
        </CardDescription>
      </CardHeader>
      <CardContent>
        {byFeature.length === 0 ? (
          <p className="text-muted-foreground py-4 text-center text-sm">
            今月の AI 利用はまだありません。
          </p>
        ) : (
          <ul className="space-y-3">
            {byFeature.map(({ feature, count }) => (
              <li key={feature} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span>{FEATURE_META[feature].label}</span>
                  <span className="text-muted-foreground tabular-nums">{count} 回</span>
                </div>
                <div
                  aria-hidden="true"
                  className="bg-muted h-1.5 w-full overflow-hidden rounded-full"
                >
                  <div
                    className="bg-foreground/60 h-full rounded-full"
                    style={{ width: `${Math.round((count / maxCount) * 100)}%` }}
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

import { Sparkles } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * 設定 → 利用状況タブ(プレースホルダ)。
 *
 * AI 利用回数の月次集計 API(`GET /workspaces/:slug/usage`)は Day 28 で実装予定。
 * Day 25 時点では「未実装」を明示するプレースホルダのみ表示する。
 */
export default function UsagePage() {
  return (
    <Card className="mx-auto max-w-xl">
      <CardHeader className="text-center">
        <div className="mx-auto mb-2 flex size-10 items-center justify-center rounded-full bg-muted">
          <Sparkles className="size-5 text-muted-foreground" aria-hidden="true" />
        </div>
        <CardTitle>AI 利用状況</CardTitle>
        <CardDescription>
          今月の AI 呼び出し回数や Free プラン残り上限の表示は Day 28(AIUsage 集計 API)で実装予定です。
        </CardDescription>
      </CardHeader>
      <CardContent className="text-muted-foreground text-center text-sm">
        現状の利用回数は DB(<code>AIUsage</code> テーブル)に記録されており、API 経由での集計エンドポイントが整い次第このタブで可視化します。
      </CardContent>
    </Card>
  );
}

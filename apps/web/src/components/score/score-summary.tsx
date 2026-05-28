import { Badge } from '@/components/ui/badge';
import { formatDateTime } from '@/lib/format';

/**
 * 結果ページ最上部の総合スコア + 実行メタ表示。
 *
 * - `totalScore` は `breakdown` の合計と BE 側でアサート済(0-100)
 * - `webSearchUsed=false` のときは「LLM 知識ベース」 と明示(競合データの精度限界を伝える)
 * - 実行日時は `Asia/Tokyo` 固定の `formatDateTime` を使う(本番 UTC との見え方差異を防止)
 */
export function ScoreSummary({
  totalScore,
  modelUsed,
  webSearchUsed,
  createdAt,
}: {
  totalScore: number;
  modelUsed: string;
  webSearchUsed: boolean;
  createdAt: string;
}) {
  return (
    <div className="bg-card text-card-foreground flex flex-wrap items-end gap-x-6 gap-y-3 rounded-md border p-5">
      <div>
        <div className="text-muted-foreground text-xs">総合スコア</div>
        <div className="text-foreground mt-1 flex items-baseline gap-1">
          <span className="text-4xl font-semibold tabular-nums">{totalScore}</span>
          <span className="text-muted-foreground text-sm">/ 100</span>
        </div>
      </div>
      <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
        <Badge variant={webSearchUsed ? 'secondary' : 'outline'}>
          {webSearchUsed ? 'Web 検索あり' : 'LLM 知識ベース'}
        </Badge>
        <span>モデル: {modelUsed}</span>
        <span>実行: {formatDateTime(createdAt)}</span>
      </div>
    </div>
  );
}

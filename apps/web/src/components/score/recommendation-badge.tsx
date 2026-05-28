import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { VALIDATION_RECOMMENDATION_META, type ValidationRecommendation } from '@/lib/api/types';

/**
 * アイデア検証の意思決定支援値(GO / PIVOT / NO_GO)を強調表示する。
 *
 * - `ServiceScore`(プロダクト診断)には recommendation が無いので、IdeaValidation 結果ページでのみ使用
 * - tone に応じて色を変える(positive=primary / neutral=secondary / negative=destructive)
 * - 説明文は `VALIDATION_RECOMMENDATION_META` を流用(BE/FE で文言一元化)
 */
export function RecommendationBadge({
  recommendation,
  size = 'md',
}: {
  recommendation: ValidationRecommendation;
  size?: 'md' | 'lg';
}) {
  const meta = VALIDATION_RECOMMENDATION_META[recommendation];
  const variant =
    meta.tone === 'positive' ? 'default' : meta.tone === 'negative' ? 'destructive' : 'secondary';

  return (
    <div className="flex items-center gap-3">
      <Badge
        variant={variant}
        className={cn(size === 'lg' && 'px-3 py-1 text-sm', 'font-semibold tracking-wide')}
      >
        {meta.label}
      </Badge>
      <span className="text-muted-foreground text-sm">{meta.description}</span>
    </div>
  );
}

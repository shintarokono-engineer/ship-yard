import { Badge } from '@/components/ui/badge';
import { MarkdownViewer } from '@/components/markdown-viewer';
import { SUGGESTION_PRIORITY_META, type Suggestion } from '@/lib/api/types';

/**
 * 改善提案リスト(プロダクト診断 / アイデア検証 共通)。
 *
 * - 優先度バッジ(HIGH=destructive / MEDIUM=secondary / LOW=outline)
 * - どの軸を改善するかを副ラベルで表示(`axisLabel[suggestion.axis]`)
 * - `body` は Markdown を許可(箇条書き対応、`MarkdownViewer` で XSS は防止済)
 */
export function SuggestionsList<A extends string>({
  suggestions,
  axisLabel,
}: {
  suggestions: Suggestion<A>[];
  axisLabel: Record<A, string>;
}) {
  if (suggestions.length === 0) {
    return <p className="text-muted-foreground text-sm">改善提案はありません。</p>;
  }

  return (
    <ol className="space-y-4">
      {suggestions.map((s) => {
        const priorityMeta = SUGGESTION_PRIORITY_META[s.priority];
        const variant =
          priorityMeta.tone === 'negative'
            ? 'destructive'
            : priorityMeta.tone === 'neutral'
              ? 'secondary'
              : 'outline';
        return (
          <li
            key={`${s.axis}-${s.title}`}
            className="bg-card text-card-foreground space-y-2 rounded-md border p-4"
          >
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={variant}>{priorityMeta.label}</Badge>
              <span className="text-muted-foreground text-xs">{axisLabel[s.axis]}</span>
            </div>
            <h4 className="text-foreground text-base font-semibold">{s.title}</h4>
            <MarkdownViewer source={s.body} />
          </li>
        );
      })}
    </ol>
  );
}

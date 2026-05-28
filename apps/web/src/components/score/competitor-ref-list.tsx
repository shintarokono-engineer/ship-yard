import { safeHref } from '@/components/lp-blocks/safe-href';
import type { CompetitorRef } from '@/lib/api/types';

/**
 * 競合プロダクトの参照リスト(プロダクト診断 / アイデア検証 共通)。
 *
 * - URL は `safeHref` で `javascript:` / `data:` 等の実行可能スキームを `#` に倒す(ADR-009 と同パターン)
 * - 外部リンクは `target="_blank" rel="noopener noreferrer"` で reverse tabnabbing を防止
 * - Web Search Tool が無効 / 失敗時は BE が空配列を返す → 0 件メッセージで明示
 */
export function CompetitorRefList({ competitorRefs }: { competitorRefs: CompetitorRef[] }) {
  if (competitorRefs.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        競合参照はありません(Web 検索が利用できなかった可能性があります)。
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {competitorRefs.map((ref, i) => {
        const href = safeHref(ref.url);
        const isExternal = href.startsWith('http://') || href.startsWith('https://');
        return (
          <li key={i} className="bg-card text-card-foreground space-y-1.5 rounded-md border p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <h4 className="text-foreground text-base font-semibold">{ref.name}</h4>
              {isExternal ? (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary text-xs underline underline-offset-2 hover:no-underline"
                >
                  {ref.url}
                </a>
              ) : (
                <span className="text-muted-foreground text-xs">{ref.url}</span>
              )}
            </div>
            <p className="text-sm leading-6">{ref.summary}</p>
            <p className="text-muted-foreground text-xs leading-5">
              <span className="font-medium">類似性メモ:</span> {ref.similarityNote}
            </p>
          </li>
        );
      })}
    </ul>
  );
}

import Link from 'next/link';
import { Clock } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { ProjectDocument } from '@/lib/api/types';
import { formatDateTime } from '@/lib/format';

/**
 * 同じ (projectId, type) で append-only に蓄積された全 version をタイムライン表示する。
 *
 * - 現在表示中の version は強調表示
 * - 各 version の項目は `<Link>` でその version の URL に飛ぶ(history-aware な永続リンク)
 * - 1 件しかない場合は履歴セクション自体を出さない(呼び出し側で判断)
 */
export function VersionHistory({
  slug,
  projectId,
  currentDocumentId,
  versions,
}: {
  slug: string;
  projectId: string;
  currentDocumentId: string;
  /** 同 (projectId, type) の全 version、version 降順で渡す。 */
  versions: readonly ProjectDocument[];
}) {
  return (
    <section aria-labelledby="version-history-heading" className="space-y-3">
      <h2 id="version-history-heading" className="flex items-center gap-2 text-sm font-medium">
        <Clock className="size-4" aria-hidden="true" />
        version 履歴
        <span className="text-muted-foreground text-xs font-normal">({versions.length} 件)</span>
      </h2>
      <ol className="border-border space-y-2 border-l-2 pl-4">
        {versions.map((v) => {
          const isCurrent = v.id === currentDocumentId;
          return (
            <li key={v.id}>
              <Link
                href={`/w/${slug}/projects/${projectId}/documents/${v.id}`}
                className={cn(
                  'block rounded-md px-3 py-2 text-sm transition-colors',
                  isCurrent
                    ? 'bg-accent/40 text-foreground font-medium'
                    : 'text-muted-foreground hover:bg-accent/30 hover:text-foreground',
                )}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-mono tabular-nums">v{v.version}</span>
                  <span className="text-xs">{formatDateTime(v.createdAt)}</span>
                </div>
                <div className="mt-1 truncate text-xs">{v.title}</div>
              </Link>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

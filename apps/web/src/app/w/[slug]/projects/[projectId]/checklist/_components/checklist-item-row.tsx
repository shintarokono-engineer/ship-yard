import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { ITEM_STATUS_META, type ChecklistItem } from '@/lib/api/types';

import { DeleteChecklistItemButton } from './delete-checklist-item-button';
import { EditChecklistItemDialog } from './edit-checklist-item-dialog';
import { StatusCheckbox } from './status-checkbox';

/**
 * チェックリスト 1 行のレンダリング。Server Component。
 *
 * - status=DONE はタイトルを取消線 + muted 表示
 * - IN_PROGRESS / NOT_APPLICABLE はバッジで状態表示(TODO / DONE はチェックボックスで表現済みなので不要)
 * - サブタスクは `parentId` でグループ化済み、本コンポーネントは「親または独立タスク」「子タスク」を
 *   `indent` プロパティで描き分ける
 * - 編集 / 削除ボタンは `canWrite`(WRITER 以上)で表示
 */
export function ChecklistItemRow({
  slug,
  projectId,
  item,
  subtaskCount,
  indent,
  canWrite,
}: {
  slug: string;
  projectId: string;
  item: ChecklistItem;
  subtaskCount: number;
  indent: boolean;
  canWrite: boolean;
}) {
  const meta = ITEM_STATUS_META[item.status];
  const showStatusBadge = item.status === 'IN_PROGRESS' || item.status === 'NOT_APPLICABLE';
  const isDone = item.status === 'DONE';

  return (
    <div
      className={cn(
        'group hover:bg-accent/30 flex items-start gap-3 rounded-md border px-3 py-2 transition-colors',
        indent && 'ml-8',
      )}
    >
      <div className="mt-0.5">
        <StatusCheckbox slug={slug} projectId={projectId} item={item} disabled={!canWrite} />
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              'text-sm',
              isDone && 'text-muted-foreground line-through',
            )}
          >
            {item.title}
          </span>
          {showStatusBadge && (
            <Badge variant={meta.badgeVariant} className={meta.badgeClassName}>
              {meta.label}
            </Badge>
          )}
        </div>
        {item.description && (
          <p className="text-muted-foreground line-clamp-2 text-xs whitespace-pre-wrap">
            {item.description}
          </p>
        )}
      </div>
      {canWrite && (
        <div className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          <EditChecklistItemDialog slug={slug} projectId={projectId} item={item} />
          <DeleteChecklistItemButton
            slug={slug}
            projectId={projectId}
            item={item}
            subtaskCount={subtaskCount}
          />
        </div>
      )}
    </div>
  );
}

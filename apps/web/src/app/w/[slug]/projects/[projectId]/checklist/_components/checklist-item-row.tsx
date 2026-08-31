'use client';

import { useOptimistic, useTransition } from 'react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { ITEM_STATUS_META, type ChecklistItem, type ItemStatus } from '@/lib/api/types';

import { toggleChecklistItemStatusAction } from '../_actions/update-checklist-item';
import { DeleteChecklistItemButton } from './delete-checklist-item-button';
import { EditChecklistItemDialog } from './edit-checklist-item-dialog';
import { StatusCheckbox } from './status-checkbox';

/**
 * チェックリスト 1 行のレンダリング。
 *
 * - status=DONE はタイトルを取消線 + muted 表示
 * - IN_PROGRESS / NOT_APPLICABLE はバッジで状態表示(TODO / DONE はチェックボックスで表現済みなので不要)
 * - サブタスクは `parentId` でグループ化済み、本コンポーネントは「親または独立タスク」「子タスク」を
 *   `indent` プロパティで描き分ける
 * - 編集 / 削除ボタンは `canWrite`(WRITER 以上)で表示
 *
 * トグルは `useOptimistic` でサーバー往復を待たずに反映する。チェック状態と取消線・バッジは
 * 同じ楽観値から描く(片方だけ先に変わると不整合に見えるため、状態は行が一括で持つ)。
 * 失敗時は transition の終了で楽観値が破棄され、サーバーの値に戻る。
 *
 * `splitAction` は「AI でタスク分解」の Dialog を **Server Component 側で描いて差し込む**
 * ための slot。この行自体が Client Component なので、`MonthlyUsageSummary` を prop で
 * 受けると全行ぶん RSC ペイロードに直列化される。実際に使うのは親タスクの Dialog だけなので、
 * 生成をサーバー側に残して必要な行にだけ渡す。
 */
export function ChecklistItemRow({
  slug,
  projectId,
  item,
  subtaskCount,
  indent,
  canWrite,
  splitAction,
}: {
  slug: string;
  projectId: string;
  item: ChecklistItem;
  subtaskCount: number;
  indent: boolean;
  canWrite: boolean;
  splitAction?: React.ReactNode;
}) {
  const [, startTransition] = useTransition();
  const [status, setOptimisticStatus] = useOptimistic<ItemStatus, ItemStatus>(
    item.status,
    (_current, next) => next,
  );

  const meta = ITEM_STATUS_META[status];
  const showStatusBadge = status === 'IN_PROGRESS' || status === 'NOT_APPLICABLE';
  const isDone = status === 'DONE';

  const handleToggle = () => {
    if (!canWrite) return;
    const nextStatus: ItemStatus = isDone ? 'TODO' : 'DONE';
    startTransition(async () => {
      setOptimisticStatus(nextStatus);
      const result = await toggleChecklistItemStatusAction(slug, projectId, item.id, nextStatus);
      if (!result.ok && result.message) {
        toast.error(result.message);
      }
    });
  };

  return (
    <div
      className={cn(
        'group hover:bg-accent/30 flex items-start gap-3 rounded-md border border-l-2 px-3 py-2 transition-colors',
        indent && 'ml-8',
        // 状態を左端の線と面で示し、完了・対象外は沈めて未着手の行が浮くようにする。
        status === 'IN_PROGRESS' ? 'border-l-amber-500' : 'border-l-transparent',
        isDone && 'bg-muted/40 opacity-65',
        status === 'NOT_APPLICABLE' && 'opacity-55',
      )}
    >
      <div className="mt-0.5">
        <StatusCheckbox
          checked={isDone}
          onToggle={handleToggle}
          disabled={!canWrite}
          label={`${item.title} を ${isDone ? '未完了' : '完了'} にする`}
        />
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn('text-sm', isDone && 'text-muted-foreground line-through')}>
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
          {/* TASK_SPLIT は親タスク(parentId=null)のみ対象。サブタスクのさらに分解は階層 2 段までの仕様外。
              呼び出し側がその条件で `splitAction` を渡す / 渡さないを決める。 */}
          {splitAction}
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

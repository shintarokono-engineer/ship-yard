'use client';

import { useTransition } from 'react';
import { toast } from 'sonner';

import { cn } from '@/lib/utils';
import type { ChecklistItem, ItemStatus } from '@/lib/api/types';

import { toggleChecklistItemStatusAction } from '../_actions/update-checklist-item';

/**
 * status を TODO ↔ DONE でトグルする軽量チェックボックス。
 *
 * - DONE / それ以外で見た目を切り替え
 * - IN_PROGRESS / NOT_APPLICABLE の項目もチェック解除で TODO になる(完全切替ではなく
 *   「完了済みかどうか」の単純トグル UX を優先)
 * - クリック中は `useTransition` で pending を可視化
 */
export function StatusCheckbox({
  slug,
  projectId,
  item,
  disabled,
}: {
  slug: string;
  projectId: string;
  item: ChecklistItem;
  disabled?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const checked = item.status === 'DONE';

  const handleToggle = () => {
    if (disabled || pending) return;
    const nextStatus: ItemStatus = checked ? 'TODO' : 'DONE';
    startTransition(async () => {
      const result = await toggleChecklistItemStatusAction(
        slug,
        projectId,
        item.id,
        nextStatus,
      );
      if (!result.ok && result.message) {
        toast.error(result.message);
      }
    });
  };

  return (
    <input
      type="checkbox"
      checked={checked}
      onChange={handleToggle}
      disabled={disabled || pending}
      aria-label={`${item.title} を ${checked ? '未完了' : '完了'} にする`}
      className={cn(
        'size-4 shrink-0 cursor-pointer accent-emerald-600',
        pending && 'opacity-50',
      )}
    />
  );
}

'use client';

import { useState } from 'react';
import { Plus, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import type { ChecklistItem } from '@/lib/api/types';

import { InlineAddForm } from './inline-add-form';

/**
 * 親タスクの直下に置く「+ サブタスクを追加」開閉スロット。
 *
 * 折りたたみ時はボタンのみ、展開時は親 category / parentId を bind した `InlineAddForm` を表示。
 * 連続追加スムーズさのため自動で閉じない(ユーザーが明示的に「閉じる」を押す)。
 */
export function SubtaskAddSlot({
  slug,
  projectId,
  parent,
}: {
  slug: string;
  projectId: string;
  parent: ChecklistItem;
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <div className="ml-8">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setOpen(true)}
          className="text-muted-foreground h-7 px-2 text-xs"
        >
          <Plus aria-hidden="true" />
          サブタスクを追加
        </Button>
      </div>
    );
  }

  return (
    <div className="ml-8 space-y-1">
      <InlineAddForm
        slug={slug}
        projectId={projectId}
        category={parent.category}
        parentId={parent.id}
      />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setOpen(false)}
        className="text-muted-foreground h-7 px-2 text-xs"
      >
        <X aria-hidden="true" />
        閉じる
      </Button>
    </div>
  );
}

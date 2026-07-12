'use client';

import { useActionState, useMemo, useState } from 'react';
import { Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import type { ChecklistItem } from '@/lib/api/types';

import {
  deleteChecklistItemAction,
  type DeleteChecklistItemFormState,
} from '../_actions/delete-checklist-item';

const INITIAL_STATE: DeleteChecklistItemFormState = { ok: false };

/**
 * ChecklistItem 削除ボタン + 確認ダイアログ。
 *
 * サブタスクがある場合は件数を出して連鎖削除を警告する。
 */
export function DeleteChecklistItemButton({
  slug,
  projectId,
  item,
  subtaskCount,
}: {
  slug: string;
  projectId: string;
  item: ChecklistItem;
  subtaskCount: number;
}) {
  const [open, setOpen] = useState(false);
  const boundAction = useMemo(
    () => deleteChecklistItemAction.bind(null, slug, projectId, item.id),
    [slug, projectId, item.id],
  );
  const [state, formAction, pending] = useActionState<DeleteChecklistItemFormState, FormData>(
    boundAction,
    INITIAL_STATE,
  );

  // 削除成功で自動 close(render 中の prev-state 比較で state 変化時に setOpen(false))。
  const [prevState, setPrevState] = useState(state);
  if (state !== prevState) {
    setPrevState(state);
    if (state.ok) setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="削除">
          <Trash2 className="size-4" aria-hidden="true" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>項目を削除しますか?</DialogTitle>
          <DialogDescription>
            <span className="font-medium text-foreground">{item.title}</span> を削除します。
          </DialogDescription>
        </DialogHeader>

        {subtaskCount > 0 && (
          <p className="text-muted-foreground rounded-md border px-3 py-2 text-sm">
            紐づくサブタスク {subtaskCount} 件も同時に削除されます。
          </p>
        )}

        <form action={formAction}>
          {state.formError && (
            <p
              role="alert"
              className="border-destructive/40 bg-destructive/10 text-destructive mb-3 rounded-md border px-3 py-2 text-sm"
            >
              {state.formError}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              キャンセル
            </Button>
            <Button type="submit" variant="destructive" disabled={pending}>
              {pending ? '削除中...' : '削除する'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

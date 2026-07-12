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

import { deleteAnnouncementAction } from '../_actions/delete-announcement';
import {
  INITIAL_DELETE_ANNOUNCEMENT_FORM_STATE,
  type DeleteAnnouncementFormState,
} from '../_shared/delete-announcement-form';

/**
 * Announcement 削除ボタン + 確認 Dialog(ADR-014)。
 * 関連 Delivery / BlogPost は DB の onDelete: Cascade で連鎖削除されるため、本ボタンは Announcement のみを呼ぶ。
 */
export function DeleteAnnouncementButton({
  slug,
  projectId,
  id,
  title,
}: {
  slug: string;
  projectId: string;
  id: string;
  title: string;
}) {
  const [open, setOpen] = useState(false);
  const boundAction = useMemo(
    () => deleteAnnouncementAction.bind(null, slug, projectId, id),
    [slug, projectId, id],
  );
  const [state, formAction, pending] = useActionState<DeleteAnnouncementFormState, FormData>(
    boundAction,
    INITIAL_DELETE_ANNOUNCEMENT_FORM_STATE,
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="destructive" size="sm">
          <Trash2 aria-hidden="true" />
          削除
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>この告知を削除しますか?</DialogTitle>
          <DialogDescription>
            <span className="text-foreground font-medium">{title}</span>{' '}
            と関連する配信 / ブログ記事をすべて削除します。この操作は元に戻せません。
          </DialogDescription>
        </DialogHeader>

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

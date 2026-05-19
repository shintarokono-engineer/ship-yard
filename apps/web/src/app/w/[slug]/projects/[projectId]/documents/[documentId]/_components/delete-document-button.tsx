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
import type { ProjectDocument } from '@/lib/api/types';

import {
  deleteDocumentAction,
  type DeleteDocumentFormState,
} from '../_actions/delete-document';

const INITIAL_STATE: DeleteDocumentFormState = { ok: false };

export function DeleteDocumentButton({
  slug,
  projectId,
  document,
}: {
  slug: string;
  projectId: string;
  document: ProjectDocument;
}) {
  const [open, setOpen] = useState(false);
  const boundAction = useMemo(
    () => deleteDocumentAction.bind(null, slug, projectId, document.id),
    [slug, projectId, document.id],
  );
  const [state, formAction, pending] = useActionState<DeleteDocumentFormState, FormData>(
    boundAction,
    INITIAL_STATE,
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="destructive">
          <Trash2 aria-hidden="true" />
          削除
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>このドキュメントを削除しますか?</DialogTitle>
          <DialogDescription>
            <span className="font-medium text-foreground">{document.title}</span>{' '}
            (v{document.version}) を削除します。この操作は元に戻せません。
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

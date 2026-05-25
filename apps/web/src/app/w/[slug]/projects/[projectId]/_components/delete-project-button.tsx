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
import type { Project } from '@/lib/api/types';

import { deleteProjectAction, type DeleteProjectFormState } from '../_actions/delete-project';

const INITIAL_STATE: DeleteProjectFormState = { ok: false };

/**
 * プロジェクト削除ボタン + 確認ダイアログ。
 *
 * 子リソース(チェックリスト / ドキュメント)も連鎖削除される旨を明示し、
 * 件数を表示してユーザーに影響範囲を把握させる。成功時は Server Action 側で
 * `/w/{slug}` にリダイレクトするのでこちら側に close ロジックは不要。
 */
export function DeleteProjectButton({ slug, project }: { slug: string; project: Project }) {
  const [open, setOpen] = useState(false);
  const boundAction = useMemo(
    () => deleteProjectAction.bind(null, slug, project.id),
    [slug, project.id],
  );
  const [state, formAction, pending] = useActionState<DeleteProjectFormState, FormData>(
    boundAction,
    INITIAL_STATE,
  );

  const hasChildren = project._count.documents > 0 || project._count.checklist > 0;

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
          <DialogTitle>プロジェクトを削除しますか?</DialogTitle>
          <DialogDescription>
            <span className="font-medium text-foreground">{project.name}</span>{' '}
            を削除します。この操作は取り消せません。
          </DialogDescription>
        </DialogHeader>

        {hasChildren && (
          <p className="text-muted-foreground rounded-md border px-3 py-2 text-sm">
            関連するドキュメント {project._count.documents} 件・チェックリスト{' '}
            {project._count.checklist} 件も同時に削除されます。
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

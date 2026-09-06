'use client';

import { useActionState, useMemo } from 'react';

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import type { Project } from '@/lib/api/types';

import { deleteProjectAction, type DeleteProjectFormState } from '../_actions/delete-project';

const INITIAL_STATE: DeleteProjectFormState = { ok: false };

/**
 * プロジェクト削除の確認ダイアログ。トリガーは `ProjectActions` のメニュー側にある。
 *
 * Dialog ではなく AlertDialog なのは、破壊的操作は明示的に選ぶまで閉じないのが適切なため
 * (外側クリックで閉じない)。
 *
 * 子リソース(チェックリスト / ドキュメント)も連鎖削除される旨を明示し、
 * 件数を表示してユーザーに影響範囲を把握させる。成功時は Server Action 側で
 * `/w/{slug}` にリダイレクトするのでこちら側に close ロジックは不要。
 */
export function DeleteProjectDialog({
  slug,
  project,
  open,
  onOpenChange,
}: {
  slug: string;
  project: Project;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
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
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>プロジェクトを削除しますか?</AlertDialogTitle>
          <AlertDialogDescription>
            <span className="text-foreground font-medium">{project.name}</span>{' '}
            を削除します。この操作は取り消せません。
          </AlertDialogDescription>
        </AlertDialogHeader>

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
          <AlertDialogFooter>
            <AlertDialogCancel type="button">キャンセル</AlertDialogCancel>
            <Button type="submit" variant="destructive" disabled={pending}>
              {pending ? '削除中...' : '削除する'}
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}

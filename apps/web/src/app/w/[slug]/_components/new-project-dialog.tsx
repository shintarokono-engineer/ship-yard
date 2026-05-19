'use client';

import { useActionState, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';

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

import { createProjectAction, type ProjectFormState } from '../_actions/create-project';
import { ProjectFormFields } from '../_shared/project-form-fields';
import { INITIAL_PROJECT_FORM_STATE } from '../_shared/project-form';

export function NewProjectDialog({ slug }: { slug: string }) {
  const [open, setOpen] = useState(false);
  const boundAction = useMemo(() => createProjectAction.bind(null, slug), [slug]);
  const [state, formAction, pending] = useActionState<ProjectFormState, FormData>(
    boundAction,
    INITIAL_PROJECT_FORM_STATE,
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus aria-hidden="true" />
          新規プロジェクト
        </Button>
      </DialogTrigger>
      {/* 内容が長いときに画面高を超えないよう、最大高 90vh + 内側スクロールに */}
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 sm:max-w-lg">
        <DialogHeader className="shrink-0 pb-4">
          <DialogTitle>新規プロジェクト</DialogTitle>
          <DialogDescription>
            名前と概要を入力してください。あとから編集できます。
          </DialogDescription>
        </DialogHeader>

        {/* noValidate でブラウザ既定のバリデーション吹き出しを抑制し、サーバー側の
            検証結果(フィールド直下 / フォーム全体)に表示を一本化する */}
        <form action={formAction} noValidate className="flex min-h-0 flex-1 flex-col gap-4">
          <div className="flex-1 space-y-4 overflow-y-auto pr-1">
            <ProjectFormFields state={state} />
          </div>

          <DialogFooter className="shrink-0 pt-4">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              キャンセル
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? '作成中...' : '作成'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

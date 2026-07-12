'use client';

import { useActionState, useMemo, useState } from 'react';
import { Pencil } from 'lucide-react';

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

import { INITIAL_PROJECT_FORM_STATE } from '../../../_shared/project-form';
import { ProjectFormFields } from '../../../_shared/project-form-fields';
import { updateProjectAction, type ProjectFormState } from '../_actions/update-project';

/**
 * プロジェクト編集ダイアログ。`NewProjectDialog` と入力 UI を `ProjectFormFields` で
 * 共有しつつ、Action と「成功時の挙動(redirect しない、close する)」だけが異なる。
 *
 * `state.ok` を `useEffect` で監視してダイアログを閉じるのが標準パターン。
 */
export function EditProjectDialog({ slug, project }: { slug: string; project: Project }) {
  const [open, setOpen] = useState(false);
  const boundAction = useMemo(
    () => updateProjectAction.bind(null, slug, project.id),
    [slug, project.id],
  );
  const [state, formAction, pending] = useActionState<ProjectFormState, FormData>(
    boundAction,
    INITIAL_PROJECT_FORM_STATE,
  );

  // 成功時に render 中で prev-state 比較して setOpen(false)。
  // 2 回目以降の連続編集でも state reference が変わるため確実に発火する。
  const [prevState, setPrevState] = useState(state);
  if (state !== prevState) {
    setPrevState(state);
    if (state.ok) setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Pencil aria-hidden="true" />
          編集
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 sm:max-w-lg">
        <DialogHeader className="shrink-0 pb-4">
          <DialogTitle>プロジェクトを編集</DialogTitle>
          <DialogDescription>名前 / 概要 / ライフサイクル状態を更新します。</DialogDescription>
        </DialogHeader>

        <form action={formAction} noValidate className="flex min-h-0 flex-1 flex-col gap-4">
          <div className="flex-1 space-y-4 overflow-y-auto pr-1">
            <ProjectFormFields
              state={state}
              defaults={{
                name: project.name,
                description: project.description ?? '',
                status: project.status,
                // 自由補足 4 フィールド(Day 44)
                targetUsers: project.targetUsers ?? '',
                problemStatement: project.problemStatement ?? '',
                proposedFeatures: project.proposedFeatures ?? '',
                pricingModel: project.pricingModel ?? '',
                // 構造化セレクト 2 フィールド(Day 46.5 案 A)
                categoryDomain: project.categoryDomain ?? '',
                pricingTier: project.pricingTier ?? '',
              }}
            />
          </div>

          <DialogFooter className="shrink-0 pt-4">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              キャンセル
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? '保存中...' : '保存'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

'use client';

import { useActionState, useEffect, useMemo, useState } from 'react';
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

  // 成功で自動 close。依存配列は state(reference)を見る — `state.ok` の値で見ると、
  // 2 回目以降の連続編集成功で `true → true` となり useEffect が再発火しないため。
  useEffect(() => {
    if (state.ok) setOpen(false);
  }, [state]);

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

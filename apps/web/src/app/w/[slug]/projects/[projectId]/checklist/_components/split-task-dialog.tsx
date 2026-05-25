'use client';

import Link from 'next/link';
import { useActionState, useEffect, useMemo, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { toast } from 'sonner';

import { FormField } from '@/app/w/[slug]/_shared/form-field';
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
import { Textarea } from '@/components/ui/textarea';
import type { ChecklistItem } from '@/lib/api/types';

import { splitTaskAction, type SplitTaskFormState } from '../_actions/split-task';
import { INITIAL_SPLIT_TASK_FORM_STATE, INSTRUCTIONS_MAX_LENGTH } from '../_shared/split-task-form';

/**
 * TASK_SPLIT(親 ChecklistItem を AI でサブタスクに分解)を起動する Dialog。
 *
 * Haiku 4.5 + Tool Use で最大 10 件の子タスクを生成し、`parentId` 付きで親の Category を継承して
 * 既存項目の末尾に追加(append-only、親は変更しない)。成功時は Dialog 自動 close + toast。
 */
export function SplitTaskDialog({
  slug,
  projectId,
  parent,
}: {
  slug: string;
  projectId: string;
  parent: ChecklistItem;
}) {
  const [open, setOpen] = useState(false);
  const boundAction = useMemo(
    () => splitTaskAction.bind(null, slug, projectId, parent.id),
    [slug, projectId, parent.id],
  );
  const [state, formAction, pending] = useActionState<SplitTaskFormState, FormData>(
    boundAction,
    INITIAL_SPLIT_TASK_FORM_STATE,
  );

  const [instructionsLength, setInstructionsLength] = useState(
    state.fields?.instructions?.length ?? 0,
  );

  useEffect(() => {
    if (state.ok && state.generatedCount !== undefined) {
      toast.success(`${state.generatedCount} 件のサブタスクを生成しました`);
      setOpen(false);
    }
  }, [state]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`「${parent.title}」を AI で分解`}
          title="AI で分解"
        >
          <Sparkles className="size-4" aria-hidden="true" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>タスクを AI で分解</DialogTitle>
          <DialogDescription>
            「{parent.title}」を実行可能なサブタスク(最大 10
            件)に分解します。生成されたタスクは親の直下にぶら下がり、既存項目には影響しません。
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-4">
          <FormField
            id="instructions"
            label="追加プロンプト(任意)"
            counter={{ current: instructionsLength, max: INSTRUCTIONS_MAX_LENGTH }}
            errors={state.fieldErrors?.instructions}
          >
            <Textarea
              id="instructions"
              name="instructions"
              rows={4}
              maxLength={INSTRUCTIONS_MAX_LENGTH}
              defaultValue={state.fields?.instructions ?? ''}
              placeholder="例: フロントとバックエンドを分けて / セキュリティ要件を厚めに / テスト粒度を細かく"
              onChange={(e) => setInstructionsLength(e.currentTarget.value.length)}
              disabled={pending}
            />
          </FormField>

          {state.formError && !state.quotaExceeded && (
            <p
              role="alert"
              className="border-destructive/40 bg-destructive/10 text-destructive rounded-md border px-3 py-2 text-sm"
            >
              {state.formError}
            </p>
          )}

          {state.quotaExceeded && (
            <div
              role="alert"
              className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-100"
            >
              <p>{state.formError}</p>
              <Link
                href={`/w/${slug}`}
                className="mt-1 inline-block text-xs underline underline-offset-2"
              >
                プランのアップグレードについて(準備中)
              </Link>
            </div>
          )}

          <p aria-live="polite" className="text-muted-foreground text-xs">
            {pending ? 'AI が分解しています。完了まで 5〜15 秒ほどかかります…' : ' '}
          </p>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              キャンセル
            </Button>
            <Button type="submit" disabled={pending} aria-busy={pending}>
              {pending ? '分解中...' : '分解する'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

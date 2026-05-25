'use client';

import Link from 'next/link';
import { useActionState, useMemo, useState } from 'react';
import { Sparkles } from 'lucide-react';

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

import { refineDocumentAction, type RefineDocumentFormState } from '../_actions/refine-document';
import {
  GOAL_MAX_LENGTH,
  INITIAL_REFINE_DOCUMENT_FORM_STATE,
} from '../_shared/refine-document-form';

/**
 * REFINE_DOC(AI で既存 ProjectDocument を推敲)Dialog。
 *
 * Sonnet 4 + Tool Use で推敲し、append-only で新版を作る。成功時は Action 側で新版に redirect
 * するので Dialog の自動 close 処理は不要(ページ遷移で消える)。EditDocumentDialog と同じ思想。
 */
export function RefineDocumentDialog({
  slug,
  projectId,
  documentId,
}: {
  slug: string;
  projectId: string;
  documentId: string;
}) {
  const [open, setOpen] = useState(false);
  const boundAction = useMemo(
    () => refineDocumentAction.bind(null, slug, projectId, documentId),
    [slug, projectId, documentId],
  );
  const [state, formAction, pending] = useActionState<RefineDocumentFormState, FormData>(
    boundAction,
    INITIAL_REFINE_DOCUMENT_FORM_STATE,
  );

  const [goalLength, setGoalLength] = useState(state.fields?.goal?.length ?? 0);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <Sparkles aria-hidden="true" />
          AI で推敲
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>ドキュメントを AI で推敲</DialogTitle>
          <DialogDescription>
            現在の本文を AI が推敲し、新しい version
            として履歴に積まれます(append-only)。完了後は最新版に自動遷移します。
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-4">
          <FormField
            id="goal"
            label="推敲の方向性(任意)"
            counter={{ current: goalLength, max: GOAL_MAX_LENGTH }}
            errors={state.fieldErrors?.goal}
          >
            <Textarea
              id="goal"
              name="goal"
              rows={4}
              maxLength={GOAL_MAX_LENGTH}
              defaultValue={state.fields?.goal ?? ''}
              placeholder="例: もっとカジュアルな口調に / セキュリティ章を厚めに / 図解の説明を足す"
              onChange={(e) => setGoalLength(e.currentTarget.value.length)}
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
            {pending ? 'AI が推敲しています。完了まで 10〜20 秒ほどかかります…' : ' '}
          </p>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              キャンセル
            </Button>
            <Button type="submit" disabled={pending} aria-busy={pending}>
              {pending ? '推敲中...' : '推敲して新版を作成'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

'use client';

import Link from 'next/link';
import { useActionState, useMemo, useState } from 'react';
import { Sparkles } from 'lucide-react';

import { FormField } from '@/app/w/[slug]/_shared/form-field';
import { CreditCostBadge } from '@/components/credit-cost-badge';
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
import type { MonthlyUsageSummary } from '@/lib/api/types';

import { refineReadmeAction, type RefineReadmeFormState } from '../_actions/refine-readme';
import {
  GOAL_MAX_LENGTH,
  INITIAL_REFINE_README_FORM_STATE,
} from '../_shared/refine-readme-form';

/**
 * REFINE_DOC(AI で既存 README を推敲)Dialog。
 *
 * §9.12.4(2026-05-29)で `documents/[documentId]/_components/refine-document-dialog.tsx` から
 * README 専用に移植。Sonnet 4 + Tool Use で推敲し、append-only で新版を作る。成功時は Action 側で
 * `/readme` に redirect するので Dialog の自動 close 処理は不要(ページ遷移で消える)。
 */
export function RefineReadmeDialog({
  slug,
  projectId,
  documentId,
  usage,
}: {
  slug: string;
  projectId: string;
  documentId: string;
  usage: MonthlyUsageSummary;
}) {
  const [open, setOpen] = useState(false);
  const boundAction = useMemo(
    () => refineReadmeAction.bind(null, slug, projectId, documentId),
    [slug, projectId, documentId],
  );
  const [state, formAction, pending] = useActionState<RefineReadmeFormState, FormData>(
    boundAction,
    INITIAL_REFINE_README_FORM_STATE,
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
          <DialogTitle>README を AI で推敲</DialogTitle>
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

          <div className="flex justify-end">
            <CreditCostBadge feature="REFINE_DOC" usage={usage} />
          </div>

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

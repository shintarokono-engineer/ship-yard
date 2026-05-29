'use client';

import { Lightbulb } from 'lucide-react';
import Link from 'next/link';
import { useActionState, useMemo, useState } from 'react';

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

import { runValidationAction, type RunValidationFormState } from '../_actions/run-validation';
import {
  INITIAL_RUN_VALIDATION_FORM_STATE,
  INSTRUCTIONS_MAX_LENGTH,
} from '../_shared/run-validation-form';

/**
 * アイデア検証を実行する Dialog(IDEA_VALIDATION、Sonnet 4 + Web Search Tool)。
 *
 * Project の詳細情報(targetUsers / problemStatement / proposedFeatures / pricingModel)を
 * BE が読むため、Dialog では追加指示のみ任意で受ける(空 OK)。BE 側で詳細情報が未入力なら
 * 400 を返す想定で、その文言を `formError` に表示してプロジェクト編集への導線を出す。
 *
 * 成功時は作成された IdeaValidation の結果ページへ遷移する(URL の `[id]` 部分)。
 */
/**
 * 成功時の遷移は Server Action 側の `redirect()` が担当する(useEffect + router.push は使わない、
 * Next.js dev の遅延コンパイルとレースコンディションを避けるため)。
 * クライアント側でハンドルするのは「入力検証エラー」「クレジット超過」「BE エラー」 等の state のみ。
 */
export function RunValidationDialog({
  slug,
  projectId,
  usage,
}: {
  slug: string;
  projectId: string;
  usage: MonthlyUsageSummary;
}) {
  const [open, setOpen] = useState(false);
  const boundAction = useMemo(
    () => runValidationAction.bind(null, slug, projectId),
    [slug, projectId],
  );
  const [state, formAction, pending] = useActionState<RunValidationFormState, FormData>(
    boundAction,
    INITIAL_RUN_VALIDATION_FORM_STATE,
  );
  const [length, setLength] = useState(state.instructions?.length ?? 0);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5">
          <Lightbulb className="size-4" aria-hidden="true" />
          検証を実行する
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>アイデア検証を実行する</DialogTitle>
          <DialogDescription>
            プロジェクトの詳細情報(課題・ターゲット・提案機能・課金モデル)を AI が読み込み、 Lean
            Startup の 5 軸でスコア化します。Web 検索で実際の競合も参照します(Pro / Team 限定、約
            1〜2 分かかります)。
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-4">
          <FormField
            id="instructions"
            label="追加の指示(任意)"
            counter={{ current: length, max: INSTRUCTIONS_MAX_LENGTH }}
            errors={state.fieldError ? [state.fieldError] : undefined}
          >
            <Textarea
              id="instructions"
              name="instructions"
              rows={4}
              maxLength={INSTRUCTIONS_MAX_LENGTH}
              defaultValue={state.instructions ?? ''}
              placeholder="例: 日本市場に絞って評価 / BtoB 観点で評価"
              onChange={(e) => setLength(e.currentTarget.value.length)}
              disabled={pending}
              aria-describedby={state.fieldError ? 'instructions-error' : undefined}
            />
          </FormField>

          {state.formError && (
            <div
              role="alert"
              className="border-destructive/40 bg-destructive/10 text-destructive space-y-2 rounded-md border px-3 py-2 text-sm"
            >
              <p>{state.formError}</p>
              {state.quotaExceeded && (
                <Link
                  href={`/w/${slug}/settings/billing`}
                  className="text-destructive inline-block text-xs font-medium underline underline-offset-2 hover:no-underline"
                >
                  プランをアップグレード
                </Link>
              )}
            </div>
          )}

          <div className="flex justify-end">
            <CreditCostBadge feature="IDEA_VALIDATION" usage={usage} />
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              キャンセル
            </Button>
            <Button type="submit" disabled={pending} aria-busy={pending}>
              {pending ? '実行中...' : '検証を実行'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

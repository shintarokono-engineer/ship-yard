'use client';

import Link from 'next/link';
import { useActionState, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Sparkles } from 'lucide-react';

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

import {
  generateLandingPageAction,
  type GenerateLpFormState,
} from '../_actions/generate-landing-page';
import {
  INITIAL_GENERATE_LP_FORM_STATE,
  INSTRUCTIONS_MAX_LENGTH,
} from '../_shared/generate-lp-form';

/**
 * LP ブロック生成(ADR-009)を起動する Dialog。
 *
 * `mode` で「初回生成」/「再生成」のラベルを切り替える。Sonnet 4 + RAG で 10〜30 秒級の同期処理に
 * なるため pending インジケータを表示し、生成中はキャンセル不可。成功時は Server Action 側で
 * プレビューページを `revalidatePath` し、`state.ok` を検知して Dialog を閉じる。
 */
export function GenerateLpDialog({
  slug,
  projectId,
  mode,
}: {
  slug: string;
  projectId: string;
  mode: 'create' | 'regenerate';
}) {
  const [open, setOpen] = useState(false);
  const boundAction = useMemo(
    () => generateLandingPageAction.bind(null, slug, projectId),
    [slug, projectId],
  );
  const [state, formAction, pending] = useActionState<GenerateLpFormState, FormData>(
    boundAction,
    INITIAL_GENERATE_LP_FORM_STATE,
  );

  const instructionsRaw = state.fields?.instructions ?? '';
  const [instructionsLength, setInstructionsLength] = useState(instructionsRaw.length);

  // 生成成功(redirect しない)時に Dialog を閉じる。プレビューは revalidatePath で再描画済み。
  // 依存は state オブジェクト全体:`useActionState` は呼び出しごとに新しい参照を返すため、
  // 連続再生成(ok が true→true で値が不変)でも effect が再発火して閉じられる。
  useEffect(() => {
    if (state.ok) setOpen(false);
  }, [state]);

  const isRegenerate = mode === 'regenerate';

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // 生成中(pending)は強制クローズしない:Action が裏で続いて結果が捨てられるため。
        if (pending) return;
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        {isRegenerate ? (
          <Button variant="outline" size="sm" className="gap-1.5">
            <RefreshCw className="size-4" aria-hidden="true" />
            AI で再生成
          </Button>
        ) : (
          <Button className="gap-1.5">
            <Sparkles className="size-4" aria-hidden="true" />
            AI で生成
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isRegenerate ? 'ランディングページを再生成' : 'ランディングページを AI で生成'}
          </DialogTitle>
          <DialogDescription>
            プロジェクト情報をもとに AI がブロック構造のランディングページを作成します。
            {isRegenerate && '再生成すると現在の内容は上書きされます。'}
            追加の指示(任意)があれば下に入力してください。
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
              defaultValue={instructionsRaw}
              placeholder="例: 開発者向けのトーンで / 無料プランの訴求を強めに / 実績の数字を前面に"
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
            {pending ? 'AI が生成しています。完了まで 10〜30 秒ほどかかります…' : ' '}
          </p>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              キャンセル
            </Button>
            <Button type="submit" disabled={pending} aria-busy={pending}>
              {pending ? '生成中...' : isRegenerate ? '再生成する' : '生成する'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

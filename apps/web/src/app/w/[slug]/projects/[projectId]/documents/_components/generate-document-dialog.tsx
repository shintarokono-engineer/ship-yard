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
import type { DocType, GeneratableDocType } from '@/lib/api/types';

import {
  generateDocumentAction,
  type GenerateDocumentFormState,
} from '../_actions/generate-document';
import {
  INITIAL_GENERATE_DOCUMENT_FORM_STATE,
  INSTRUCTIONS_MAX_LENGTH,
} from '../_shared/generate-document-form';

/**
 * DRAFT_GEN(README / LP の AI 生成)を起動する Dialog。
 *
 * 「(未作成)」破線カード内のボタンから開く。Sonnet 4 + RAG で 10〜30 秒級の同期処理になるため
 * Dialog 内 pending インジケータを表示し、生成中はキャンセル不可。成功時は Server Action 側で
 * 新 document 詳細ページへ redirect する(Dialog は次ページ描画で消える)。
 */
export function GenerateDocumentDialog({
  slug,
  projectId,
  docType,
  typeLabel,
}: {
  slug: string;
  projectId: string;
  docType: GeneratableDocType;
  /** カード側で表示中のラベル(例: 「README」「リリースブログ」)。Dialog タイトルに使う。 */
  typeLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const boundAction = useMemo(
    () => generateDocumentAction.bind(null, slug, projectId, docType satisfies DocType),
    [slug, projectId, docType],
  );
  const [state, formAction, pending] = useActionState<GenerateDocumentFormState, FormData>(
    boundAction,
    INITIAL_GENERATE_DOCUMENT_FORM_STATE,
  );

  const instructionsRaw = state.fields?.instructions ?? '';
  const [instructionsLength, setInstructionsLength] = useState(instructionsRaw.length);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // 生成中(pending)は強制クローズしない:Action が裏で続いてしまい結果が捨てられるため。
        if (pending) return;
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Sparkles className="size-4" aria-hidden="true" />
          AI で生成
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{typeLabel} を AI で生成</DialogTitle>
          <DialogDescription>
            プロジェクト情報をもとに AI
            が初稿を作成します。追加の指示(任意)があれば下に入力してください。
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
              placeholder="例: 開発者向けのトーンで / セキュリティ要件を強調 / 機能リストを箇条書きで"
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
            {pending ? 'AI が生成しています。完了まで 10〜30 秒ほどかかります…' : ' '}
          </p>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              キャンセル
            </Button>
            <Button type="submit" disabled={pending} aria-busy={pending}>
              {pending ? '生成中...' : '生成する'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

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
import { CATEGORIES, CATEGORY_META, type Category } from '@/lib/api/types';

import {
  generateChecklistAction,
  type GenerateChecklistFormState,
} from '../_actions/generate-checklist';
import {
  INITIAL_GENERATE_CHECKLIST_FORM_STATE,
  INSTRUCTIONS_MAX_LENGTH,
} from '../_shared/generate-checklist-form';

/**
 * CHECKLIST_GEN(AI でチェックリスト一括生成)を起動する Dialog。
 *
 * Haiku 4.5 + Tool Use で最大 30 件をプロジェクト情報から生成し、既存項目の後ろに追記する。
 * 数〜十数秒の同期処理なので Dialog 内 pending インジケータで状態表示。成功時は Dialog 自動 close
 * + toast で生成件数を通知。redirect なし(同じページに留まる)。
 */
export function GenerateChecklistDialog({
  slug,
  projectId,
}: {
  slug: string;
  projectId: string;
}) {
  const [open, setOpen] = useState(false);
  const boundAction = useMemo(
    () => generateChecklistAction.bind(null, slug, projectId),
    [slug, projectId],
  );
  const [state, formAction, pending] = useActionState<GenerateChecklistFormState, FormData>(
    boundAction,
    INITIAL_GENERATE_CHECKLIST_FORM_STATE,
  );

  // 全カテゴリをデフォルト選択。「全選択 = キーなし送信 = 全カテゴリ生成」というルール。
  const [selected, setSelected] = useState<Set<Category>>(() => new Set(CATEGORIES));
  const [instructionsLength, setInstructionsLength] = useState(
    state.fields?.instructions?.length ?? 0,
  );

  // 成功で Dialog を自動 close + toast。state を deps にすることで同値再 submit でも反応する。
  useEffect(() => {
    if (state.ok && state.generatedCount !== undefined) {
      toast.success(`${state.generatedCount} 件のチェックリスト項目を生成しました`);
      setOpen(false);
    }
  }, [state]);

  const toggleCategory = (c: Category) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });
  };

  const submitDisabled = pending || selected.size === 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Sparkles className="size-4" aria-hidden="true" />
          AI で一括生成
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>チェックリストを AI で一括生成</DialogTitle>
          <DialogDescription>
            プロジェクト情報をもとに AI が必要なタスクを最大 30 件まで提案します。既存の項目には影響せず、後ろに追記されます。
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-4">
          <FormField
            id="categories"
            label="生成するカテゴリ"
            errors={state.fieldErrors?.categories}
          >
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((c) => {
                const checked = selected.has(c);
                return (
                  <label
                    key={c}
                    className={
                      'inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors ' +
                      (checked
                        ? 'border-foreground bg-foreground text-background'
                        : 'border-input text-muted-foreground hover:bg-accent/30')
                    }
                  >
                    <input
                      type="checkbox"
                      name="categories"
                      value={c}
                      checked={checked}
                      onChange={() => toggleCategory(c)}
                      disabled={pending}
                      className="sr-only"
                    />
                    {CATEGORY_META[c].label}
                  </label>
                );
              })}
            </div>
          </FormField>

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
              placeholder="例: 個人開発スコープに絞る / セキュリティを厚めに / マーケティング寄りで"
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
            {pending ? 'AI が生成しています。完了まで 5〜15 秒ほどかかります…' : ' '}
          </p>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              キャンセル
            </Button>
            <Button type="submit" disabled={submitDisabled} aria-busy={pending}>
              {pending ? '生成中...' : '生成する'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

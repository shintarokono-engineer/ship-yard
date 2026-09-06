'use client';

import Link from 'next/link';
import { useActionState, useEffect, useMemo, useState } from 'react';
import { ListChecks } from 'lucide-react';
import { toast } from 'sonner';

import { FormField } from '@/app/w/[slug]/_shared/form-field';
import { CreditCostBadge } from '@/components/credit-cost-badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
import { trackGenerationCompleted } from '@/lib/analytics';
import {
  SUGGESTION_PRIORITY_META,
  type MonthlyUsageSummary,
  type Suggestion,
  type SuggestionSource,
} from '@/lib/api/types';

import {
  createTasksFromSuggestionsAction,
  type SuggestionTasksFormState,
} from '../_actions/create-tasks-from-suggestions';
import {
  INITIAL_SUGGESTION_TASKS_FORM_STATE,
  INSTRUCTIONS_MAX_LENGTH,
} from '../_shared/suggestion-tasks-form';

/**
 * 改善提案を選んでチェックリスト項目にする Dialog(F17)。
 *
 * 選んだ提案は 1 回の AI 呼び出しにまとめる。何件選んでも 1cr で、提案間で重複するタスクを
 * AI 側でまとめられる利点もある。生成された項目は確認を挟まずそのまま作成する
 * (既存 8 機能すべてと同じ挙動。気に入らなければチェックリスト画面で削除・編集できる)。
 *
 * 提案の本文は表示しない。直下の `SuggestionsList` に既に出ているので冗長になるため、
 * ここは優先度 / 軸 / タイトルだけで選べるようにする。
 */
export function SuggestionTasksDialog<A extends string>({
  slug,
  projectId,
  source,
  sourceId,
  suggestions,
  axisLabel,
  usage,
}: {
  slug: string;
  projectId: string;
  source: SuggestionSource;
  /** `ServiceScore.id` または `IdeaValidation.id`。 */
  sourceId: string;
  suggestions: Suggestion<A>[];
  axisLabel: Record<A, string>;
  usage: MonthlyUsageSummary;
}) {
  const [open, setOpen] = useState(false);
  const boundAction = useMemo(
    () => createTasksFromSuggestionsAction.bind(null, slug, projectId, source, sourceId),
    [slug, projectId, source, sourceId],
  );
  const [state, formAction, pending] = useActionState<SuggestionTasksFormState, FormData>(
    boundAction,
    INITIAL_SUGGESTION_TASKS_FORM_STATE,
  );

  // 初期選択は優先度 HIGH のみ。全件既定にすると意図せず広く生成されるため。
  const [selected, setSelected] = useState<Set<number>>(
    () => new Set(suggestions.flatMap((s, i) => (s.priority === 'HIGH' ? [i] : []))),
  );
  const [instructionsLength, setInstructionsLength] = useState(
    state.fields?.instructions?.length ?? 0,
  );

  // 成功で Dialog を自動 close + toast。state を deps にすることで同値再 submit でも反応する。
  useEffect(() => {
    if (state.ok && state.generatedCount !== undefined) {
      trackGenerationCompleted('checklist');
      if (state.generatedCount === 0) {
        // 生成自体は成功していて、結果が既存項目と重複していただけ。エラーではないので
        // info で出す。「何の項目が無かったのか」が分かる文言にする。
        toast.info('生成されたタスクはすべて既存の項目と重複していたため、追加しませんでした');
      } else {
        toast.success(`${state.generatedCount} 件のチェックリスト項目を作成しました`);
      }
      setOpen(false);
    }
  }, [state]);

  const toggle = (i: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
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
          <ListChecks className="size-4" aria-hidden="true" />
          選んでタスク化
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>改善提案をタスク化</DialogTitle>
          <DialogDescription>
            選んだ提案を AI が実行可能なタスクへ分解し、チェックリストの末尾に追加します。1
            つの提案が複数の分野にまたがる場合は、分野ごとに分けて作成されます。
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-4">
          {/* checkbox 群なので fieldset + legend にする(FormField の docstring 参照)。
              <label htmlFor> は単一コントロール用で、グループ名がスクリーンリーダーに伝わらない。 */}
          <FormField
            as="fieldset"
            id="indexes"
            label="タスク化する提案"
            errors={state.fieldErrors?.indexes}
          >
            <div className="space-y-2">
              {suggestions.map((s, i) => {
                const checked = selected.has(i);
                const meta = SUGGESTION_PRIORITY_META[s.priority];
                const variant =
                  meta.tone === 'negative'
                    ? 'destructive'
                    : meta.tone === 'neutral'
                      ? 'secondary'
                      : 'outline';
                return (
                  <label
                    key={`${s.axis}-${s.title}`}
                    className={
                      'flex cursor-pointer items-start gap-2.5 rounded-md border p-2.5 text-sm transition-colors ' +
                      (checked
                        ? 'border-foreground bg-accent/30'
                        : 'border-input hover:bg-accent/20')
                    }
                  >
                    <Checkbox
                      name="indexes"
                      value={i}
                      checked={checked}
                      onCheckedChange={() => toggle(i)}
                      disabled={pending}
                      className="mt-1 shrink-0"
                    />
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge variant={variant} className="text-[10px]">
                          {meta.label}
                        </Badge>
                        <span className="text-muted-foreground text-xs">{axisLabel[s.axis]}</span>
                      </div>
                      <div className="font-medium">{s.title}</div>
                    </div>
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
              rows={3}
              maxLength={INSTRUCTIONS_MAX_LENGTH}
              defaultValue={state.fields?.instructions ?? ''}
              placeholder="例: 技術タスクだけにする / 個人開発スコープに絞る"
              onChange={(e) => setInstructionsLength(e.currentTarget.value.length)}
              disabled={pending}
            />
          </FormField>

          {state.formError && !state.quotaExceeded && (
            <Alert variant="destructive">
              <AlertDescription>{state.formError}</AlertDescription>
            </Alert>
          )}

          {state.quotaExceeded && (
            <Alert variant="warning">
              <AlertDescription>
                {state.formError}
                <Link
                  href={`/w/${slug}/settings/billing`}
                  className="text-xs underline underline-offset-2"
                >
                  プランをアップグレード
                </Link>
              </AlertDescription>
            </Alert>
          )}

          <p aria-live="polite" className="text-muted-foreground text-xs">
            {pending ? 'AI が分解しています。完了まで 5〜15 秒ほどかかります…' : ' '}
          </p>

          <div className="flex justify-end">
            <CreditCostBadge feature="CHECKLIST_GEN" usage={usage} />
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              キャンセル
            </Button>
            <Button type="submit" disabled={submitDisabled} aria-busy={pending}>
              {pending ? '作成中...' : `${selected.size} 件をタスク化`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

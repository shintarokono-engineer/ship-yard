'use client';

import Link from 'next/link';
import { useActionState, useEffect, useMemo, useState } from 'react';
import { FileText } from 'lucide-react';
import { toast } from 'sonner';

import { FormField } from '@/app/w/[slug]/_shared/form-field';
import { CreditCostBadge } from '@/components/credit-cost-badge';
import { InlineEmpty } from '@/components/inline-empty';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
import { EMPTY_MESSAGES } from '@/lib/empty-messages';
import { trackGenerationCompleted } from '@/lib/analytics';
import type { MonthlyUsageSummary } from '@/lib/api/types';

import {
  applyDescriptionAction,
  type ApplyDescriptionFormState,
} from '../_actions/apply-description';
import {
  summarizeSessionAction,
  type SessionSummaryFormState,
} from '../_actions/summarize-session';
import {
  DESCRIPTION_MAX_LENGTH,
  INITIAL_APPLY_DESCRIPTION_FORM_STATE,
  INITIAL_SESSION_SUMMARY_FORM_STATE,
  INSTRUCTIONS_MAX_LENGTH,
} from '../_shared/session-summary-form';

/**
 * 壁打ちの内容をプロジェクト概要に反映する Dialog。
 *
 * 2 ステップ(生成 → プレビュー確認 → 保存)。`description` は履歴が無く上書きすると
 * 戻せないため、生成結果をそのまま保存せず人の承認を挟む。
 *
 * ステップは `summaryState` から導出せず `preview` state で持つ。`useActionState` にリセット API が
 * 無く、フックは閉じても mount されたままのため、派生させると入力ステップに戻れなくなる。
 */
export function ReflectDescriptionDialog({
  slug,
  projectId,
  sessionId,
  usage,
}: {
  slug: string;
  projectId: string;
  sessionId: string;
  usage: MonthlyUsageSummary;
}) {
  const [open, setOpen] = useState(false);

  const boundSummarize = useMemo(
    () => summarizeSessionAction.bind(null, slug, projectId, sessionId),
    [slug, projectId, sessionId],
  );
  const [summaryState, summarizeAction, summarizing] = useActionState<
    SessionSummaryFormState,
    FormData
  >(boundSummarize, INITIAL_SESSION_SUMMARY_FORM_STATE);

  const boundApply = useMemo(
    () => applyDescriptionAction.bind(null, slug, projectId),
    [slug, projectId],
  );
  const [applyState, applyAction, applying] = useActionState<ApplyDescriptionFormState, FormData>(
    boundApply,
    INITIAL_APPLY_DESCRIPTION_FORM_STATE,
  );

  const [instructionsLength, setInstructionsLength] = useState(
    summaryState.fields?.instructions?.length ?? 0,
  );
  const [draft, setDraft] = useState('');
  /** null = ステップ 1(入力)、文字列 = ステップ 2(プレビュー)。 */
  const [preview, setPreview] = useState<string | null>(null);

  const busy = summarizing || applying;

  const resetToInput = () => {
    setPreview(null);
    setDraft('');
  };

  /**
   * 開閉はすべてここを通す。Radix の `onOpenChange` は Radix 自身が状態を変えるとき
   * (Esc / オーバーレイ / ✕)しか発火せず、ボタンから `setOpen(false)` を直接呼ぶと
   * リセットが漏れる。
   */
  const changeOpen = (next: boolean) => {
    if (busy) return;
    if (!next) resetToInput();
    setOpen(next);
  };

  // deps を summaryState にすることで同じ内容の再生成にも反応する。
  useEffect(() => {
    if (summaryState.ok && summaryState.description !== undefined) {
      setPreview(summaryState.description);
      setDraft(summaryState.description);
      trackGenerationCompleted('description');
    }
  }, [summaryState]);

  useEffect(() => {
    if (applyState.ok) {
      toast.success('プロジェクトの概要を更新しました');
      setOpen(false);
      resetToInput();
    }
  }, [applyState]);

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <FileText className="size-4" aria-hidden="true" />
          この会話を概要に反映
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>会話をプロジェクト概要に反映</DialogTitle>
          <DialogDescription>
            この壁打ちの内容を AI
            が要約し、プロジェクトの概要文を作成します。内容を確認・編集してから保存できます。
          </DialogDescription>
        </DialogHeader>

        {preview === null ? (
          <form action={summarizeAction} className="space-y-4">
            <FormField
              id="instructions"
              label="追加プロンプト(任意)"
              counter={{ current: instructionsLength, max: INSTRUCTIONS_MAX_LENGTH }}
              errors={summaryState.fieldErrors?.instructions}
            >
              <Textarea
                id="instructions"
                name="instructions"
                rows={3}
                maxLength={INSTRUCTIONS_MAX_LENGTH}
                defaultValue={summaryState.fields?.instructions ?? ''}
                placeholder="例: 技術的な詳細は省いて事業面を中心に / 3 行程度に短く"
                onChange={(e) => setInstructionsLength(e.currentTarget.value.length)}
                disabled={summarizing}
              />
            </FormField>

            {summaryState.formError && !summaryState.quotaExceeded && (
              <Alert variant="destructive">
                <AlertDescription>{summaryState.formError}</AlertDescription>
              </Alert>
            )}

            {summaryState.quotaExceeded && (
              <Alert variant="warning">
                <AlertDescription>
                  {summaryState.formError}
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
              {summarizing ? 'AI が会話を要約しています。完了まで 10〜20 秒ほどかかります…' : ' '}
            </p>

            <div className="flex justify-end">
              <CreditCostBadge feature="DESCRIPTION_SYNC" usage={usage} />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => changeOpen(false)}
                disabled={summarizing}
              >
                キャンセル
              </Button>
              <Button type="submit" disabled={summarizing} aria-busy={summarizing}>
                {summarizing ? '生成中...' : '概要を生成'}
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <form action={applyAction} className="space-y-4">
            <section aria-labelledby="current-description-heading" className="space-y-1.5">
              <h3 id="current-description-heading" className="text-sm font-medium">
                現在の概要
              </h3>
              {summaryState.currentDescription ? (
                <p className="bg-muted/40 max-h-32 overflow-y-auto rounded-md p-3 text-sm whitespace-pre-wrap">
                  {summaryState.currentDescription}
                </p>
              ) : (
                <InlineEmpty>{EMPTY_MESSAGES.currentProjectDescription}</InlineEmpty>
              )}
            </section>

            {summaryState.transcriptTruncated && (
              <Alert variant="warning">
                <AlertDescription>
                  会話が長いため、<strong>直近のやり取りだけ</strong>
                  を要約対象にしました。前半の内容は反映されていません。
                </AlertDescription>
              </Alert>
            )}

            {summaryState.descriptionTruncated && (
              <Alert variant="warning">
                <AlertDescription>
                  生成された概要が上限文字数に達したため末尾を切り詰めました。文末が途中で切れて
                  いないか確認してください。
                </AlertDescription>
              </Alert>
            )}

            <FormField
              id="description"
              label="新しい概要(編集できます)"
              errors={applyState.fieldErrors?.description}
            >
              <Textarea
                id="description"
                name="description"
                rows={10}
                maxLength={DESCRIPTION_MAX_LENGTH}
                value={draft}
                onChange={(e) => setDraft(e.currentTarget.value)}
                disabled={applying}
              />
            </FormField>

            {applyState.formError && (
              <Alert variant="destructive">
                <AlertDescription>{applyState.formError}</AlertDescription>
              </Alert>
            )}

            <Alert>
              <AlertDescription>
                保存すると現在の概要は置き換わります(元に戻すことはできません)。保存せずに閉じると
                生成した内容は失われますが、消費したクレジットは戻りません。
              </AlertDescription>
            </Alert>

            <p aria-live="polite" className="text-muted-foreground text-xs">
              {applying ? '保存しています…' : ' '}
            </p>

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => changeOpen(false)}
                disabled={applying}
              >
                キャンセル
              </Button>
              <Button type="button" variant="ghost" onClick={resetToInput} disabled={applying}>
                作り直す
              </Button>
              <Button type="submit" disabled={applying} aria-busy={applying}>
                {applying ? '保存中...' : 'この内容で保存'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

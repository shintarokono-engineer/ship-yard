'use client';

import Link from 'next/link';
import { useActionState, useEffect, useMemo, useState } from 'react';
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
import {
  ANNOUNCEMENT_TOPIC_MAX,
  DELIVERY_CHANNELS,
  DELIVERY_CHANNEL_META,
  type DeliveryChannel,
  type MonthlyUsageSummary,
} from '@/lib/api/types';

import {
  generateAnnouncementAction,
  INITIAL_GENERATE_ANNOUNCEMENT_FORM_STATE,
  type GenerateAnnouncementFormState,
} from '../_actions/generate-announcement';

/**
 * ANNOUNCEMENT_GEN(多チャネル告知文の AI 生成)を起動する Dialog(ADR-014)。
 *
 * - `topic`(必須):今回伝えたい内容(自由入力)
 * - `channels`(任意):部分再生成。未選択 = 全 channel(TWITTER + BLOG)
 *
 * Sonnet 4 + Tool Use で 10〜30 秒級。生成中はキャンセル不可、成功時は自動 close + revalidate。
 */
export function GenerateAnnouncementDialog({
  slug,
  projectId,
  id,
  usage,
  hasExistingDeliveries,
}: {
  slug: string;
  projectId: string;
  id: string;
  usage: MonthlyUsageSummary;
  /** 既に Delivery が生成済か。true の場合は「再生成」ラベルを使う。 */
  hasExistingDeliveries: boolean;
}) {
  const [open, setOpen] = useState(false);
  const boundAction = useMemo(
    () => generateAnnouncementAction.bind(null, slug, projectId, id),
    [slug, projectId, id],
  );
  const [state, formAction, pending] = useActionState<GenerateAnnouncementFormState, FormData>(
    boundAction,
    INITIAL_GENERATE_ANNOUNCEMENT_FORM_STATE,
  );
  const topicRaw = state.fields?.topic ?? '';
  const [topicLength, setTopicLength] = useState(topicRaw.length);

  useEffect(() => {
    if (state.ok && !pending) {
      setOpen(false);
    }
  }, [state.ok, pending]);

  const buttonLabel = hasExistingDeliveries ? 'AI で再生成' : 'AI で文面を生成';

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
          {buttonLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>多チャネル告知文を AI で生成</DialogTitle>
          <DialogDescription>
            X (Twitter) とブログ向けの文面を 1 回の生成で用意します。
            {hasExistingDeliveries && (
              <> 既存の文面は上書きされます(BlogPost の slug は維持)。</>
            )}
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-4">
          <FormField
            id="topic"
            label="告知内容(何を伝えたいか)"
            required
            counter={{ current: topicLength, max: ANNOUNCEMENT_TOPIC_MAX }}
            errors={state.fieldErrors?.topic}
          >
            <Textarea
              id="topic"
              name="topic"
              rows={4}
              maxLength={ANNOUNCEMENT_TOPIC_MAX}
              defaultValue={topicRaw}
              placeholder="例: v1.2 をリリース。AI 文面生成の精度向上と価格改定を実施。"
              onChange={(e) => setTopicLength(e.currentTarget.value.length)}
              disabled={pending}
              required
            />
          </FormField>

          {hasExistingDeliveries && (
            <FormField
              as="fieldset"
              id="channels"
              label="再生成するチャネル(未選択 = 全チャネル)"
            >
              <div className="flex flex-wrap gap-4">
                {DELIVERY_CHANNELS.map((c: DeliveryChannel) => (
                  <label key={c} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="channels"
                      value={c}
                      disabled={pending}
                      className="border-input size-4 rounded border"
                    />
                    {DELIVERY_CHANNEL_META[c].label}
                  </label>
                ))}
              </div>
            </FormField>
          )}

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

          <div className="flex justify-end">
            <CreditCostBadge feature="ANNOUNCEMENT_GEN" usage={usage} />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
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

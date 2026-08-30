'use client';

import Link from 'next/link';
import { useActionState, useMemo, useState } from 'react';
import { Sparkles } from 'lucide-react';

import { FormField } from '@/app/w/[slug]/_shared/form-field';
import { CreditCostBadge } from '@/components/credit-cost-badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
import {
  ANNOUNCEMENT_TOPIC_MAX,
  DELIVERY_CHANNELS,
  DELIVERY_CHANNEL_META,
  type DeliveryChannel,
  type MonthlyUsageSummary,
} from '@/lib/api/types';

import { generateAnnouncementAction } from '../_actions/generate-announcement';
import {
  INITIAL_GENERATE_ANNOUNCEMENT_FORM_STATE,
  validateGenerateAnnouncementForm,
  type GenerateAnnouncementFormState,
} from '../_shared/generate-announcement-form';

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

  // クライアント事前検証エラー(null の間はサーバ側 state.fieldErrors を表示)。
  const [clientFieldErrors, setClientFieldErrors] = useState<
    GenerateAnnouncementFormState['fieldErrors'] | null
  >(null);
  const displayErrors = clientFieldErrors ?? state.fieldErrors;

  // 空送信など不正入力は dispatch せず弾く(サーバ往復なし=ボタン文言のちらつき防止)。
  function handleSubmit(formData: FormData) {
    const parsed = validateGenerateAnnouncementForm(formData);
    if (!parsed.data) {
      setClientFieldErrors(parsed.fieldErrors);
      return;
    }
    setClientFieldErrors(null);
    formAction(formData);
  }

  const [prevState, setPrevState] = useState(state);
  if (state !== prevState) {
    setPrevState(state);
    if (state.ok && !pending) setOpen(false);
  }

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
            {hasExistingDeliveries && <> 既存の文面は上書きされます(BlogPost の slug は維持)。</>}
          </DialogDescription>
        </DialogHeader>

        {/* noValidate: ブラウザ標準 required を抑止し、クライアント/サーバ共通のカスタム文言で統一。
            空送信はクライアント側で弾くため dispatch されず、ボタン文言はちらつかない。 */}
        <form action={handleSubmit} className="space-y-4" noValidate>
          <FormField
            id="topic"
            label="告知内容(何を伝えたいか)"
            required
            counter={{ current: topicLength, max: ANNOUNCEMENT_TOPIC_MAX }}
            errors={displayErrors?.topic}
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
            <FormField as="fieldset" id="channels" label="再生成するチャネル(未選択 = 全チャネル)">
              <div className="flex flex-wrap gap-4">
                {DELIVERY_CHANNELS.map((c: DeliveryChannel) => (
                  <label key={c} className="flex cursor-pointer items-center gap-2 text-sm">
                    {/*
                      Radix Checkbox は実体が <button>。フォーム内では name/value を持つ
                      hidden input を内部で生成するので、FormData.getAll('channels') は従来どおり。
                    */}
                    <Checkbox name="channels" value={c} disabled={pending} />
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
            {pending ? 'AI が生成しています。完了まで 10〜30 秒ほどかかります…' : ' '}
          </p>

          <div className="flex justify-end">
            <CreditCostBadge feature="ANNOUNCEMENT_GEN" usage={usage} />
          </div>

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

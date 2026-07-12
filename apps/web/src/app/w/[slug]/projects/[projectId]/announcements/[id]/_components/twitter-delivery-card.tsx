'use client';

import { useActionState, useMemo, useState } from 'react';
import { CheckCircle2, ExternalLink, Pencil, Twitter } from 'lucide-react';

import { FormField } from '@/app/w/[slug]/_shared/form-field';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  DELIVERY_STATUS_META,
  TWITTER_TEXT_MAX,
  type Delivery,
  type TwitterDeliveryContent,
} from '@/lib/api/types';
import { formatDateTime } from '@/lib/format';

import { executeDeliveryAction } from '../_actions/execute-delivery';
import { updateAnnouncementAction } from '../_actions/update-announcement';
import {
  INITIAL_EXECUTE_DELIVERY_FORM_STATE,
  type ExecuteDeliveryFormState,
} from '../_shared/execute-delivery-form';
import {
  INITIAL_UPDATE_ANNOUNCEMENT_FORM_STATE,
  type UpdateAnnouncementFormState,
} from '../_shared/update-announcement-form';

/** X の投稿画面(Web Intent)を新規タブで開く URL。 */
function twitterIntentUrl(text: string): string {
  return `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
}

/**
 * Twitter Delivery カード(ADR-014 MVP:Web Intent 方式)。
 * - 「X で投稿」ボタン → 新規タブで X の投稿画面を開く
 * - 「送信完了」ボタン → BE を叩いて Delivery.status = SENT にマーク
 */
export function TwitterDeliveryCard({
  slug,
  projectId,
  announcementId,
  delivery,
  canWrite,
}: {
  slug: string;
  projectId: string;
  announcementId: string;
  delivery: Delivery;
  canWrite: boolean;
}) {
  const content = delivery.content as TwitterDeliveryContent;
  const stMeta = DELIVERY_STATUS_META[delivery.status];
  const isSent = delivery.status === 'SENT';

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2 text-base">
          <span className="flex items-center gap-2">
            <Twitter className="text-primary size-4" aria-hidden="true" />
            X (Twitter)
            <Badge variant={stMeta.badgeVariant} className={stMeta.badgeClassName}>
              {stMeta.label}
            </Badge>
          </span>
          {canWrite && (
            <div className="flex gap-2">
              <EditTwitterContentDialog
                slug={slug}
                projectId={projectId}
                announcementId={announcementId}
                currentText={content.text}
                disabled={isSent}
              />
              {!isSent && (
                <>
                  <Button asChild variant="outline" size="sm" className="gap-1.5">
                    <a
                      href={twitterIntentUrl(content.text)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ExternalLink className="size-3.5" aria-hidden="true" />
                      X で投稿する
                    </a>
                  </Button>
                  <MarkSentButton
                    slug={slug}
                    projectId={projectId}
                    announcementId={announcementId}
                    deliveryId={delivery.id}
                  />
                </>
              )}
            </div>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="bg-muted/40 whitespace-pre-wrap rounded-md p-3 text-sm">{content.text}</p>
        <div className="text-muted-foreground space-y-1 text-xs">
          <p className="tabular-nums">
            {content.text.length} / {TWITTER_TEXT_MAX} 文字
          </p>
          {delivery.sentAt && <p>送信完了 {formatDateTime(delivery.sentAt)}</p>}
          {delivery.error && (
            <p
              role="alert"
              className="border-destructive/40 bg-destructive/10 text-destructive rounded-md border px-2 py-1.5"
            >
              {delivery.error}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function EditTwitterContentDialog({
  slug,
  projectId,
  announcementId,
  currentText,
  disabled,
}: {
  slug: string;
  projectId: string;
  announcementId: string;
  currentText: string;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const boundAction = useMemo(
    () => updateAnnouncementAction.bind(null, slug, projectId, announcementId, 'twitter'),
    [slug, projectId, announcementId],
  );
  const [state, formAction, pending] = useActionState<UpdateAnnouncementFormState, FormData>(
    boundAction,
    INITIAL_UPDATE_ANNOUNCEMENT_FORM_STATE,
  );
  const textRaw = state.fields?.twitterText ?? currentText;
  const [textLength, setTextLength] = useState(textRaw.length);

  // 成功時に render 中の prev-state 比較で setOpen(false)(useEffect の再発火経路を避ける)。
  const [prevState, setPrevState] = useState(state);
  if (state !== prevState) {
    setPrevState(state);
    if (state.ok && !pending) setOpen(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" disabled={disabled}>
          <Pencil className="size-3.5" aria-hidden="true" />
          編集
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>X の投稿文を編集</DialogTitle>
          <DialogDescription>
            280 文字以内。ハッシュタグや絵文字も含めて入力してください。
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-4">
          <FormField
            id="twitterText"
            label="本文"
            counter={{ current: textLength, max: TWITTER_TEXT_MAX }}
            errors={state.fieldErrors?.twitterText}
          >
            <Textarea
              id="twitterText"
              name="twitterText"
              rows={6}
              maxLength={TWITTER_TEXT_MAX}
              defaultValue={textRaw}
              onChange={(e) => setTextLength(e.currentTarget.value.length)}
              disabled={pending}
              required
            />
          </FormField>

          {state.formError && (
            <p
              role="alert"
              className="border-destructive/40 bg-destructive/10 text-destructive rounded-md border px-3 py-2 text-sm"
            >
              {state.formError}
            </p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              キャンセル
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? '保存中...' : '保存'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * X 側で送信完了したことをユーザーが手動確認するボタン(Web Intent 方式)。
 * BE は X API を叩かず、Delivery.status を SENT にマークするだけ。
 */
function MarkSentButton({
  slug,
  projectId,
  announcementId,
  deliveryId,
}: {
  slug: string;
  projectId: string;
  announcementId: string;
  deliveryId: string;
}) {
  const [open, setOpen] = useState(false);
  const boundAction = useMemo(
    () => executeDeliveryAction.bind(null, slug, projectId, announcementId, deliveryId),
    [slug, projectId, announcementId, deliveryId],
  );
  const [state, formAction, pending] = useActionState<ExecuteDeliveryFormState, FormData>(
    boundAction,
    INITIAL_EXECUTE_DELIVERY_FORM_STATE,
  );

  // 成功時に render 中の prev-state 比較で setOpen(false)(useEffect の再発火経路を避ける)。
  const [prevState, setPrevState] = useState(state);
  if (state !== prevState) {
    setPrevState(state);
    if (state.ok && !pending) setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5">
          <CheckCircle2 className="size-3.5" aria-hidden="true" />
          送信完了
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>X で送信完了しましたか?</DialogTitle>
          <DialogDescription>
            X の投稿画面で「ツイートする」を押した後にクリックしてください。この配信を「送信済み」としてマークします。
          </DialogDescription>
        </DialogHeader>

        <form action={formAction}>
          {state.formError && (
            <p
              role="alert"
              className="border-destructive/40 bg-destructive/10 text-destructive mb-3 rounded-md border px-3 py-2 text-sm"
            >
              {state.formError}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              まだ
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? '記録中...' : '送信完了とする'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

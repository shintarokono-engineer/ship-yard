'use client';

import { useActionState, useEffect, useMemo, useState } from 'react';
import { Pencil, Send, Twitter } from 'lucide-react';

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

import {
  executeDeliveryAction,
  INITIAL_EXECUTE_DELIVERY_FORM_STATE,
  type ExecuteDeliveryFormState,
} from '../_actions/execute-delivery';
import {
  updateAnnouncementAction,
  INITIAL_UPDATE_ANNOUNCEMENT_FORM_STATE,
  type UpdateAnnouncementFormState,
} from '../_actions/update-announcement';

/**
 * Twitter Delivery 表示 + 編集 + 投稿実行カード(ADR-014)。
 *
 * - content.text を表示
 * - 「編集」 Dialog で `updateAnnouncementAction('twitter', ...)` を呼び content を上書き
 * - 「X に投稿」ボタンで `executeDeliveryAction` を呼び実投稿(MVP は同期即時)
 * - 投稿後の状態(SENT / FAILED)と sentAt / externalRef / error を表示
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
                disabled={delivery.status === 'SENT' || delivery.status === 'SCHEDULED'}
              />
              <ExecuteTwitterButton
                slug={slug}
                projectId={projectId}
                announcementId={announcementId}
                deliveryId={delivery.id}
                disabled={delivery.status === 'SENT' || delivery.status === 'SCHEDULED'}
              />
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
          {delivery.sentAt && <p>投稿日時 {formatDateTime(delivery.sentAt)}</p>}
          {delivery.externalRef && (
            <p>
              ツイート ID:{' '}
              <code className="rounded bg-black/5 px-1 dark:bg-white/10">
                {delivery.externalRef}
              </code>
            </p>
          )}
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

  useEffect(() => {
    if (state.ok && !pending) {
      setOpen(false);
    }
  }, [state.ok, pending]);

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

function ExecuteTwitterButton({
  slug,
  projectId,
  announcementId,
  deliveryId,
  disabled,
}: {
  slug: string;
  projectId: string;
  announcementId: string;
  deliveryId: string;
  disabled: boolean;
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

  useEffect(() => {
    if (state.ok && !pending) {
      setOpen(false);
    }
  }, [state.ok, pending]);

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
      <DialogTrigger asChild>
        <Button size="sm" disabled={disabled} className="gap-1.5">
          <Send className="size-3.5" aria-hidden="true" />
          X に投稿
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>X に投稿しますか?</DialogTitle>
          <DialogDescription>
            連携済みの X アカウントから投稿します。投稿後は取り消せません。
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
              キャンセル
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? '投稿中...' : '投稿する'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

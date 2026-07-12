'use client';

import { useActionState, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';

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
import { Input } from '@/components/ui/input';
import { ANNOUNCEMENT_TITLE_MAX } from '@/lib/api/types';

import { createAnnouncementAction } from '../_actions/create-announcement';
import {
  INITIAL_CREATE_ANNOUNCEMENT_FORM_STATE,
  type CreateAnnouncementFormState,
} from '../_shared/create-announcement-form';

/**
 * Announcement(ADR-014)新規作成 Dialog。
 *
 * MVP では `title`(内部管理用)のみ受け取り、AI 生成 / Twitter content の編集は
 * 作成直後の遷移先(`/announcements/{id}`)で行う。
 */
export function NewAnnouncementDialog({
  slug,
  projectId,
}: {
  slug: string;
  projectId: string;
}) {
  const [open, setOpen] = useState(false);
  const boundAction = useMemo(
    () => createAnnouncementAction.bind(null, slug, projectId),
    [slug, projectId],
  );
  const [state, formAction, pending] = useActionState<CreateAnnouncementFormState, FormData>(
    boundAction,
    INITIAL_CREATE_ANNOUNCEMENT_FORM_STATE,
  );
  const titleRaw = state.fields?.title ?? '';
  const [titleLength, setTitleLength] = useState(titleRaw.length);

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
          <Plus className="size-4" aria-hidden="true" />
          告知を作成
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>新しい告知を作成</DialogTitle>
          <DialogDescription>
            まず内部管理用のタイトルを入力します。配信文面は次の画面で AI 生成 / 編集できます。
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-4">
          <FormField
            id="title"
            label="タイトル(内部管理用)"
            counter={{ current: titleLength, max: ANNOUNCEMENT_TITLE_MAX }}
            errors={state.fieldErrors?.title}
          >
            <Input
              id="title"
              name="title"
              maxLength={ANNOUNCEMENT_TITLE_MAX}
              defaultValue={titleRaw}
              placeholder="例: v1.2 リリース告知、〇〇機能ローンチ"
              onChange={(e) => setTitleLength(e.currentTarget.value.length)}
              disabled={pending}
              aria-describedby={
                state.fieldErrors?.title && state.fieldErrors.title.length > 0
                  ? 'title-error'
                  : undefined
              }
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
            <Button type="submit" disabled={pending} aria-busy={pending}>
              {pending ? '作成中...' : '作成して編集に進む'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

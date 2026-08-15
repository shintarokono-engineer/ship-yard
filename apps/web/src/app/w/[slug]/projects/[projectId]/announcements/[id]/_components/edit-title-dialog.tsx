'use client';

import { useActionState, useMemo, useState } from 'react';
import { Pencil } from 'lucide-react';

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

import { updateAnnouncementAction } from '../_actions/update-announcement';
import {
  INITIAL_UPDATE_ANNOUNCEMENT_FORM_STATE,
  validateUpdateAnnouncementForm,
  type UpdateAnnouncementFormState,
} from '../_shared/update-announcement-form';

/** Announcement のタイトル(内部管理用)編集 Dialog(ADR-014)。 */
export function EditAnnouncementTitleDialog({
  slug,
  projectId,
  id,
  currentTitle,
}: {
  slug: string;
  projectId: string;
  id: string;
  currentTitle: string;
}) {
  const [open, setOpen] = useState(false);
  const boundAction = useMemo(
    () => updateAnnouncementAction.bind(null, slug, projectId, id, 'title'),
    [slug, projectId, id],
  );
  const [state, formAction, pending] = useActionState<UpdateAnnouncementFormState, FormData>(
    boundAction,
    INITIAL_UPDATE_ANNOUNCEMENT_FORM_STATE,
  );
  const titleRaw = state.fields?.title ?? currentTitle;
  const [titleLength, setTitleLength] = useState(titleRaw.length);

  // クライアント事前検証エラー(null の間はサーバ側 state.fieldErrors を表示)。
  const [clientFieldErrors, setClientFieldErrors] = useState<
    UpdateAnnouncementFormState['fieldErrors'] | null
  >(null);
  const displayErrors = clientFieldErrors ?? state.fieldErrors;

  // 空送信など不正入力は dispatch せず弾く(サーバ往復なし=ボタン文言のちらつき防止)。
  function handleSubmit(formData: FormData) {
    const parsed = validateUpdateAnnouncementForm('title', formData);
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

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5">
          <Pencil className="size-3.5" aria-hidden="true" />
          タイトルを編集
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>タイトル(内部管理用)を編集</DialogTitle>
          <DialogDescription>
            告知一覧で表示される識別用タイトル。配信文面には影響しません。
          </DialogDescription>
        </DialogHeader>

        {/* noValidate: ブラウザ標準 required を抑止し、クライアント/サーバ共通のカスタム文言で統一。
            空送信はクライアント側で弾くため dispatch されず、ボタン文言はちらつかない。 */}
        <form action={handleSubmit} className="space-y-4" noValidate>
          <FormField
            id="title"
            label="タイトル"
            counter={{ current: titleLength, max: ANNOUNCEMENT_TITLE_MAX }}
            errors={displayErrors?.title}
          >
            <Input
              id="title"
              name="title"
              maxLength={ANNOUNCEMENT_TITLE_MAX}
              defaultValue={titleRaw}
              onChange={(e) => setTitleLength(e.currentTarget.value.length)}
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
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
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

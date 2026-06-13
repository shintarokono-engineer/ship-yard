'use client';

import { useActionState, useMemo, useState } from 'react';
import { Pencil } from 'lucide-react';

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
import { Textarea } from '@/components/ui/textarea';
import type { ProjectDocument } from '@/lib/api/types';

import { FormField } from '@/app/w/[slug]/_shared/form-field';
import {
  CONTENT_MAX_LENGTH,
  INITIAL_README_FORM_STATE,
  TITLE_MAX_LENGTH,
} from '../_shared/readme-form';
import { editReadmeAction, type ReadmeFormState } from '../_actions/edit-readme';

/**
 * README 編集ダイアログ。append-only なので保存すると新 version となり、Action 側で `/readme` に
 * redirect されて Server Component が最新を表示する。Project / Checklist の編集ダイアログと違って
 * 自動 close 不要。§9.12.4(2026-05-29)で `documents/[documentId]/_components/edit-document-dialog.tsx`
 * から README 専用に移植。
 */
export function EditReadmeDialog({
  slug,
  projectId,
  document,
}: {
  slug: string;
  projectId: string;
  document: ProjectDocument;
}) {
  const [open, setOpen] = useState(false);
  const boundAction = useMemo(
    () => editReadmeAction.bind(null, slug, projectId, document.id),
    [slug, projectId, document.id],
  );
  const [state, formAction, pending] = useActionState<ReadmeFormState, FormData>(
    boundAction,
    INITIAL_README_FORM_STATE,
  );

  const initialTitle = state.fields?.title ?? document.title;
  const initialContent = state.fields?.content ?? document.content ?? '';
  const [titleLength, setTitleLength] = useState(initialTitle.length);
  const [contentLength, setContentLength] = useState(initialContent.length);

  const titleErrors = state.fieldErrors?.title;
  const contentErrors = state.fieldErrors?.content;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Pencil aria-hidden="true" />
          編集
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 sm:max-w-3xl">
        <DialogHeader className="shrink-0 pb-4">
          <DialogTitle>README を編集</DialogTitle>
          <DialogDescription>
            保存すると新しい version として履歴に積まれます(append-only)。
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} noValidate className="flex min-h-0 flex-1 flex-col gap-4">
          <div className="flex-1 space-y-4 overflow-y-auto pr-1">
            <FormField
              id="title"
              label="タイトル"
              counter={{ current: titleLength, max: TITLE_MAX_LENGTH }}
              errors={titleErrors}
            >
              <Input
                id="title"
                name="title"
                required
                aria-invalid={titleErrors && titleErrors.length > 0 ? 'true' : undefined}
                aria-describedby={titleErrors && titleErrors.length > 0 ? 'title-error' : undefined}
                maxLength={TITLE_MAX_LENGTH}
                defaultValue={initialTitle}
                onChange={(e) => setTitleLength(e.currentTarget.value.length)}
              />
            </FormField>

            <FormField
              id="content"
              label="本文(Markdown)"
              counter={{ current: contentLength, max: CONTENT_MAX_LENGTH }}
              errors={contentErrors}
            >
              <Textarea
                id="content"
                name="content"
                rows={20}
                aria-invalid={contentErrors && contentErrors.length > 0 ? 'true' : undefined}
                aria-describedby={
                  contentErrors && contentErrors.length > 0 ? 'content-error' : undefined
                }
                maxLength={CONTENT_MAX_LENGTH}
                defaultValue={initialContent}
                onChange={(e) => setContentLength(e.currentTarget.value.length)}
                className="font-mono text-xs leading-6"
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
          </div>

          <DialogFooter className="shrink-0 pt-4">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              キャンセル
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? '保存中...' : '保存して新版を作成'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

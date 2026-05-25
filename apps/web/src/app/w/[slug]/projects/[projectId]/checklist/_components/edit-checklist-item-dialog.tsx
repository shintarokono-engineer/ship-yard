'use client';

import { useActionState, useEffect, useMemo, useState } from 'react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  CATEGORIES,
  CATEGORY_META,
  ITEM_STATUSES,
  ITEM_STATUS_META,
  type ChecklistItem,
} from '@/lib/api/types';

import { FormField } from '../../../../_shared/form-field';
import {
  DESCRIPTION_MAX_LENGTH,
  INITIAL_CHECKLIST_FORM_STATE,
  TITLE_MAX_LENGTH,
} from '../_shared/checklist-form';
import {
  updateChecklistItemAction,
  type ChecklistItemFormState,
} from '../_actions/update-checklist-item';

/**
 * ChecklistItem 編集ダイアログ。
 *
 * title / category / description / status を一括更新する。
 * 親子関係(parentId)の編集はここからは行わない:
 * - 子サブタスクの作成は一覧画面の「+ サブタスク」(SubtaskAddSlot)経由
 * - 親変更は「現親で削除 → 別親で追加」の 2 ステップで実現
 * 成功で自動 close(`[state]` 依存で連続編集にも対応、Day 19 と同じパターン)。
 */
export function EditChecklistItemDialog({
  slug,
  projectId,
  item,
}: {
  slug: string;
  projectId: string;
  item: ChecklistItem;
}) {
  const [open, setOpen] = useState(false);
  const boundAction = useMemo(
    () => updateChecklistItemAction.bind(null, slug, projectId, item.id),
    [slug, projectId, item.id],
  );
  const [state, formAction, pending] = useActionState<ChecklistItemFormState, FormData>(
    boundAction,
    INITIAL_CHECKLIST_FORM_STATE,
  );

  useEffect(() => {
    if (state.ok) setOpen(false);
  }, [state]);

  const initialTitle = state.fields?.title ?? item.title;
  const initialDescription = state.fields?.description ?? item.description ?? '';
  const initialCategory = state.fields?.category ?? item.category;
  const initialStatus = state.fields?.status ?? item.status;

  const [titleLength, setTitleLength] = useState(initialTitle.length);
  const [descriptionLength, setDescriptionLength] = useState(initialDescription.length);

  const titleErrors = state.fieldErrors?.title;
  const descriptionErrors = state.fieldErrors?.description;
  const categoryErrors = state.fieldErrors?.category;
  const statusErrors = state.fieldErrors?.status;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="編集">
          <Pencil className="size-4" aria-hidden="true" />
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 sm:max-w-lg">
        <DialogHeader className="shrink-0 pb-4">
          <DialogTitle>項目を編集</DialogTitle>
          <DialogDescription>タイトル / カテゴリ / 説明 / 進捗状態を更新します。</DialogDescription>
        </DialogHeader>

        <form action={formAction} noValidate className="flex min-h-0 flex-1 flex-col gap-4">
          <div className="flex-1 space-y-4 overflow-y-auto pr-1">
            <FormField
              id="title"
              label="タイトル"
              required
              counter={{ current: titleLength, max: TITLE_MAX_LENGTH }}
              errors={titleErrors}
            >
              <Input
                id="title"
                name="title"
                required
                aria-required="true"
                aria-invalid={titleErrors && titleErrors.length > 0 ? 'true' : undefined}
                aria-describedby={titleErrors && titleErrors.length > 0 ? 'title-error' : undefined}
                maxLength={TITLE_MAX_LENGTH}
                defaultValue={initialTitle}
                onChange={(e) => setTitleLength(e.currentTarget.value.length)}
              />
            </FormField>

            <FormField id="category" label="カテゴリ" required errors={categoryErrors}>
              <Select name="category" defaultValue={initialCategory}>
                <SelectTrigger
                  id="category"
                  aria-invalid={categoryErrors && categoryErrors.length > 0 ? 'true' : undefined}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {CATEGORY_META[c].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>

            <FormField
              id="description"
              label="説明(Markdown 可)"
              counter={{ current: descriptionLength, max: DESCRIPTION_MAX_LENGTH }}
              errors={descriptionErrors}
            >
              <Textarea
                id="description"
                name="description"
                rows={4}
                aria-invalid={
                  descriptionErrors && descriptionErrors.length > 0 ? 'true' : undefined
                }
                aria-describedby={
                  descriptionErrors && descriptionErrors.length > 0
                    ? 'description-error'
                    : undefined
                }
                maxLength={DESCRIPTION_MAX_LENGTH}
                defaultValue={initialDescription}
                onChange={(e) => setDescriptionLength(e.currentTarget.value.length)}
              />
            </FormField>

            <FormField id="status" label="進捗状態" errors={statusErrors}>
              <Select name="status" defaultValue={initialStatus}>
                <SelectTrigger
                  id="status"
                  aria-invalid={statusErrors && statusErrors.length > 0 ? 'true' : undefined}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ITEM_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {ITEM_STATUS_META[s].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
              {pending ? '保存中...' : '保存'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

'use client';

import { useActionState, useEffect, useMemo, useRef } from 'react';
import { Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Category } from '@/lib/api/types';

import { INITIAL_CHECKLIST_FORM_STATE, TITLE_MAX_LENGTH } from '../_shared/checklist-form';
import {
  createChecklistItemAction,
  type ChecklistItemFormState,
} from '../_actions/create-checklist-item';

/**
 * カテゴリ末尾の「+ 項目を追加」インラインフォーム。
 *
 * - `category` を bind で固定して title 1 入力に絞る
 * - 成功で input をクリア + 再フォーカス(連続入力をスムーズに)
 * - エラー時は input 直下にメッセージ、入力値を保持
 */
export function InlineAddForm({
  slug,
  projectId,
  category,
  parentId,
}: {
  slug: string;
  projectId: string;
  category: Category;
  /** 指定するとサブタスクとして紐付く。未指定はトップレベル項目として作成。 */
  parentId?: string;
}) {
  const boundAction = useMemo(
    () => createChecklistItemAction.bind(null, slug, projectId, category, parentId),
    [slug, projectId, category, parentId],
  );
  const [state, formAction, pending] = useActionState<ChecklistItemFormState, FormData>(
    boundAction,
    INITIAL_CHECKLIST_FORM_STATE,
  );
  const inputRef = useRef<HTMLInputElement>(null);

  // 成功で input クリア + フォーカス。state(reference)変化で発火するよう [state] を指定。
  useEffect(() => {
    if (state.ok && inputRef.current) {
      inputRef.current.value = '';
      inputRef.current.focus();
    }
  }, [state]);

  const titleErrors = state.fieldErrors?.title;

  return (
    <form action={formAction} noValidate className="space-y-1">
      <div className="flex gap-2">
        <Input
          ref={inputRef}
          name="title"
          required
          aria-required="true"
          aria-invalid={titleErrors && titleErrors.length > 0 ? 'true' : undefined}
          aria-describedby={
            titleErrors && titleErrors.length > 0 ? `add-${category}-error` : undefined
          }
          maxLength={TITLE_MAX_LENGTH}
          placeholder="項目を追加..."
          defaultValue={state.fields?.title ?? ''}
          className="h-9"
        />
        <Button type="submit" disabled={pending} variant="outline" size="sm" className="shrink-0">
          <Plus aria-hidden="true" />
          {pending ? '追加中...' : '追加'}
        </Button>
      </div>
      {titleErrors && titleErrors.length > 0 && (
        <ul id={`add-${category}-error`} role="alert" className="text-destructive text-xs">
          {titleErrors.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      )}
      {state.formError && (
        <p role="alert" className="text-destructive text-xs">
          {state.formError}
        </p>
      )}
    </form>
  );
}

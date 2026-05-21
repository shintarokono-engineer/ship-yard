'use client';

import { useState } from 'react';

import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { PROJECT_STATUSES, PROJECT_STATUS_META } from '@/lib/api/types';

import { FormField } from './form-field';
import {
  DESCRIPTION_MAX_LENGTH,
  NAME_MAX_LENGTH,
  type ProjectFormState,
} from './project-form';

/**
 * プロジェクト作成 / 編集ダイアログで共通利用する入力フィールド一式。
 *
 * - `state` … 直前の Server Action の戻り値。`fieldErrors` / `formError` / `fields` を表示に反映
 * - `defaults` … 編集時の現在値(state.fields が無いときの fallback として使う)
 * - `variant` … `'name-only'` は名前のみ表示し概要・状態を省く(AI 壁打ちモード、§9.7)
 *
 * `state.fields` が再表示用スナップショット、`defaults` が「初回表示の初期値」。
 * バリデーションエラーで弾かれた場合 `state.fields` を優先して入力を保持する。
 */
export function ProjectFormFields({
  state,
  defaults,
  variant = 'full',
}: {
  state: ProjectFormState;
  defaults?: { name?: string; description?: string; status?: string };
  variant?: 'full' | 'name-only';
}) {
  const initialName = state.fields?.name ?? defaults?.name ?? '';
  const initialDescription = state.fields?.description ?? defaults?.description ?? '';
  const initialStatus = state.fields?.status ?? defaults?.status ?? 'IDEA';

  const [nameLength, setNameLength] = useState(initialName.length);
  const [descriptionLength, setDescriptionLength] = useState(initialDescription.length);

  const nameErrors = state.fieldErrors?.name;
  const descriptionErrors = state.fieldErrors?.description;
  const statusErrors = state.fieldErrors?.status;

  const nameOnly = variant === 'name-only';

  return (
    <>
      <FormField
        id="name"
        label="名前"
        required
        counter={{ current: nameLength, max: NAME_MAX_LENGTH }}
        errors={nameErrors}
      >
        <Input
          id="name"
          name="name"
          required
          aria-required="true"
          aria-invalid={nameErrors && nameErrors.length > 0 ? 'true' : undefined}
          aria-describedby={nameErrors && nameErrors.length > 0 ? 'name-error' : undefined}
          maxLength={NAME_MAX_LENGTH}
          placeholder="例: roadster-cost-tracker"
          defaultValue={initialName}
          onChange={(e) => setNameLength(e.currentTarget.value.length)}
        />
      </FormField>

      {nameOnly ? (
        // AI 壁打ちモードは概要を作成後に AI と詰めるため、IDEA 状態で名前のみ作成する。
        // 概要・状態は描画しないので、その field エラーは表示先が無く state.formError に出る
        <input type="hidden" name="status" value="IDEA" />
      ) : (
        <>
          <FormField
            id="description"
            label="概要(Markdown 可)"
            counter={{ current: descriptionLength, max: DESCRIPTION_MAX_LENGTH }}
            errors={descriptionErrors}
          >
            <Textarea
              id="description"
              name="description"
              rows={5}
              aria-invalid={
                descriptionErrors && descriptionErrors.length > 0 ? 'true' : undefined
              }
              aria-describedby={
                descriptionErrors && descriptionErrors.length > 0
                  ? 'description-error'
                  : undefined
              }
              maxLength={DESCRIPTION_MAX_LENGTH}
              placeholder="解きたい課題、想定ユーザー、差別化のメモなど"
              defaultValue={initialDescription}
              onChange={(e) => setDescriptionLength(e.currentTarget.value.length)}
            />
          </FormField>

          <FormField id="status" label="ライフサイクル状態" errors={statusErrors}>
            <Select name="status" defaultValue={initialStatus}>
              <SelectTrigger
                id="status"
                aria-invalid={statusErrors && statusErrors.length > 0 ? 'true' : undefined}
                aria-describedby={
                  statusErrors && statusErrors.length > 0 ? 'status-error' : undefined
                }
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROJECT_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {PROJECT_STATUS_META[s].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
        </>
      )}

      {state.formError && (
        <p
          role="alert"
          className="border-destructive/40 bg-destructive/10 text-destructive rounded-md border px-3 py-2 text-sm"
        >
          {state.formError}
        </p>
      )}
    </>
  );
}

// FormField / CharCounter は `_shared/form-field.tsx` に移管(ドメイン非依存)。
// Day 21 以降の Document フォームからも同じ部品を再利用する。
export { FormField, CharCounter } from './form-field';

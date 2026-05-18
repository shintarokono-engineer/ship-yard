'use client';

import { useState, type ReactNode } from 'react';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { PROJECT_STATUSES, PROJECT_STATUS_META } from '@/lib/api/types';

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
 *
 * `state.fields` が再表示用スナップショット、`defaults` が「初回表示の初期値」。
 * バリデーションエラーで弾かれた場合 `state.fields` を優先して入力を保持する。
 */
export function ProjectFormFields({
  state,
  defaults,
}: {
  state: ProjectFormState;
  defaults?: { name?: string; description?: string; status?: string };
}) {
  const initialName = state.fields?.name ?? defaults?.name ?? '';
  const initialDescription = state.fields?.description ?? defaults?.description ?? '';
  const initialStatus = state.fields?.status ?? defaults?.status ?? 'IDEA';

  const [nameLength, setNameLength] = useState(initialName.length);
  const [descriptionLength, setDescriptionLength] = useState(initialDescription.length);

  const nameErrors = state.fieldErrors?.name;
  const descriptionErrors = state.fieldErrors?.description;
  const statusErrors = state.fieldErrors?.status;

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

/**
 * ラベル + カウンタ + 子(Input/Textarea/Select) + フィールド直下のエラーをまとめたレイアウト。
 * a11y: エラー要素 id を `aria-describedby` で結びつける前提(各 Input 側で指定)。
 */
export function FormField({
  id,
  label,
  required,
  counter,
  errors,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  counter?: { current: number; max: number };
  errors?: string[];
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <Label htmlFor={id}>
          {label}
          {required && (
            <span aria-hidden="true" className="text-destructive ml-0.5">
              *
            </span>
          )}
        </Label>
        {counter && <CharCounter current={counter.current} max={counter.max} />}
      </div>
      {children}
      {errors && errors.length > 0 && (
        <ul id={`${id}-error`} role="alert" className="text-destructive space-y-0.5 text-sm">
          {errors.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * 文字数カウンタ。`current >= max` で `text-destructive` に切り替えて上限到達を可視化する。
 */
export function CharCounter({ current, max }: { current: number; max: number }) {
  const reachedLimit = current >= max;
  return (
    <span
      aria-live="polite"
      className={cn(
        'text-xs tabular-nums',
        reachedLimit ? 'text-destructive font-medium' : 'text-muted-foreground',
      )}
    >
      {current} / {max}
    </span>
  );
}

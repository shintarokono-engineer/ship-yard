'use client';

import { type ReactNode } from 'react';

import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

/**
 * ラベル + カウンタ + 子(Input/Textarea/Select) + フィールド直下のエラーをまとめた
 * ドメイン非依存のフォームフィールド枠。
 *
 * a11y: エラー要素 id を `aria-describedby` で結びつける前提(各 Input 側で指定)。
 *
 * `as="fieldset"` を指定するとチェックボックス / ラジオの**グループ**用に外枠を
 * `<fieldset>` + `<legend>` に切り替える(`<label htmlFor>` は単一フォームコントロール
 * 用で `<div>` 中の checkbox 群には意味的に効かないため)。
 */
export function FormField({
  id,
  label,
  required,
  counter,
  errors,
  children,
  as = 'div',
}: {
  id: string;
  label: string;
  required?: boolean;
  counter?: { current: number; max: number };
  errors?: string[];
  children: ReactNode;
  as?: 'div' | 'fieldset';
}) {
  const requiredMark = required && (
    <span aria-hidden="true" className="text-destructive ml-0.5">
      *
    </span>
  );
  const errorList = errors && errors.length > 0 && (
    <ul id={`${id}-error`} role="alert" className="text-destructive space-y-0.5 text-sm">
      {errors.map((m) => (
        <li key={m}>{m}</li>
      ))}
    </ul>
  );
  const counterEl = counter && <CharCounter current={counter.current} max={counter.max} />;

  if (as === 'fieldset') {
    // `<fieldset>` + `<legend>` で group label を関連付け(WAI-ARIA で複数選択 UI に推奨)。
    // `<legend>` の見た目を `<Label>` と揃えるためクラスを直書き(shadcn Label は <label> 専用)。
    return (
      <fieldset className="space-y-2">
        <div className="flex items-baseline justify-between gap-2">
          <legend className="text-sm font-medium leading-none">
            {label}
            {requiredMark}
          </legend>
          {counterEl}
        </div>
        {children}
        {errorList}
      </fieldset>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <Label htmlFor={id}>
          {label}
          {requiredMark}
        </Label>
        {counterEl}
      </div>
      {children}
      {errorList}
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

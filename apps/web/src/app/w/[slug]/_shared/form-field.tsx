'use client';

import { type ReactNode } from 'react';

import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

/**
 * ラベル + カウンタ + 子(Input/Textarea/Select) + フィールド直下のエラーをまとめた
 * ドメイン非依存のフォームフィールド枠。
 *
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
